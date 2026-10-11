import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Ator } from 'src/shared/ator/ator';
import { AuditLogService } from '../../auditLog/auditLog.service';
import { CategoriaRepository } from '../../categoria/categoria.repository';
import {
  Categoria,
  DONO_CURSINHO,
} from '../../categoria/schemas/categoria.schema';
import { HistoricoRepository } from '../../historico/historico.repository';
import { revalidarBloqueado } from '../../simulado/helpers/bloqueado';
import { Simulado } from '../../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../../simulado/simulado.repository';
import { EditarDadosProvaDTOInput } from '../dtos/editar-dados.dto.input';
import {
  provaProtegida,
  TEXTO_OFICIAL,
  TEXTO_OUTRO_CURSINHO,
} from '../helpers/pode-compor-prova';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';

export const TEXTO_NOME_EM_USO = 'Já existe uma prova com esse nome.';
export const TEXTO_JA_FEITA_CATEGORIA =
  'Não dá para trocar a categoria: alunos já enviaram cartões desta prova.';
export const TEXTO_CARTAO_EMITIDO =
  'Não dá para trocar a categoria: o cartão-resposta desta prova já foi gerado.';
export const TEXTO_CATEGORIA_ENEM_CURSINHO =
  'A categoria de uma prova ENEM do cursinho não pode ser trocada: ela define os simulados da prova.';
export const TEXTO_CATEGORIA_INVALIDA =
  'Use uma categoria do seu cursinho que esteja em uso.';
export const TEXTO_JA_FEITA_EXCLUIR =
  'Não dá para excluir: alunos já enviaram cartões desta prova.';

const idDe = (v: unknown): string => String((v as { _id?: unknown })?._id ?? v);

/**
 * Card 41 — editar os dados e excluir uma prova do CURSINHO.
 *
 * ⚠️ **Só prova do cursinho do ator, e nunca oficial** — a mesma regra do
 * card 30 na api e do `duplicar` aqui. A permissão
 * (`cadastrarProvasCursinho`) é checada na api; o ms decide o DONO pelo
 * `x-ator`. Prova da plataforma não passa por aqui (decisão do card).
 *
 * Regras (aprovadas na análise do card):
 * - nome, ano, edição e aplicação: sempre. Renomear renomeia o simulado 1:1;
 * - categoria: só sem cartão enviado e sem cartão gerado, e se nenhuma
 *   questão passar do novo total;
 * - excluir: lógico, só sem cartão enviado. "Prova em evento" é checado na
 *   api, que é quem tem os eventos.
 */
@Injectable()
export class ProvaGestaoService {
  constructor(
    private readonly provas: ProvaRepository,
    private readonly categorias: CategoriaRepository,
    private readonly simulados: SimuladoRepository,
    private readonly historicos: HistoricoRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  private async provaDoAtor(id: string, ator?: Ator): Promise<Prova> {
    const prova = await this.provas.getById(id);
    if (!prova || (await this.provas.estaExcluida(id))) {
      throw new NotFoundException('Prova não encontrada.');
    }
    const dono = prova.cursinhoId ?? null;
    if (!ator?.cursinhoId || dono !== ator.cursinhoId) {
      throw new ForbiddenException(
        dono === null ? TEXTO_OFICIAL : TEXTO_OUTRO_CURSINHO,
      );
    }
    if (provaProtegida(prova.categoria)) {
      throw new ForbiddenException(TEXTO_OFICIAL);
    }
    return prova;
  }

  private simuladoIds(prova: Prova): string[] {
    return (prova.simulados ?? []).map(idDe);
  }

  async editar(
    id: string,
    dto: EditarDadosProvaDTOInput,
    ator?: Ator,
  ): Promise<{ nome: string }> {
    const prova = await this.provaDoAtor(id, ator);
    const set: Record<string, unknown> = {};
    const de: Record<string, unknown> = {};

    if (dto.nome !== undefined) {
      const nome = dto.nome.trim();
      if (!nome) throw new BadRequestException('A prova precisa de um nome.');
      if (nome !== prova.nome) {
        const outra = await this.provas.getAtivaByNomeECursinho(
          nome,
          ator!.cursinhoId,
        );
        if (outra && idDe(outra) !== id) {
          throw new ConflictException(TEXTO_NOME_EM_USO);
        }
        set.nome = nome;
        de.nome = prova.nome;
      }
    }
    for (const campo of ['ano', 'edicao', 'aplicacao'] as const) {
      if (dto[campo] !== undefined && dto[campo] !== prova[campo]) {
        set[campo] = dto[campo];
        de[campo] = prova[campo];
      }
    }

    let novaCategoria: Categoria | null = null;
    if (dto.categoria && dto.categoria !== idDe(prova.categoria)) {
      novaCategoria = await this.validarTrocaDeCategoria(
        prova,
        dto.categoria,
        ator!,
      );
      set.categoria = novaCategoria._id;
      set.totalQuestao = novaCategoria.quantidadeTotalQuestao;
      de.categoria = idDe(prova.categoria);
    }

    if (!Object.keys(set).length) return { nome: prova.nome };

    await this.provas.atualizarDados(id, set);
    if (set.nome) {
      await this.simulados.renomear(
        this.simuladoIds(prova),
        set.nome as string,
      );
    }
    if (novaCategoria) {
      await this.trocarCategoriaDosSimulados(prova, novaCategoria);
    }

    await this.auditLog.create({
      user: ator!.userId,
      entityId: id,
      entityType: 'Prova',
      changes: JSON.stringify({
        acao: 'editarDados',
        de,
        para: {
          ...set,
          categoria: novaCategoria ? idDe(novaCategoria) : undefined,
        },
        cursinhoId: ator!.cursinhoId,
      }),
    });
    return { nome: (set.nome as string) ?? prova.nome };
  }

  private async validarTrocaDeCategoria(
    prova: Prova,
    categoriaId: string,
    ator: Ator,
  ): Promise<Categoria> {
    /*
      tickets/038: a categoria compartilhada decide quantos simulados a prova
      tem (2 no Dia 1, 1 no Dia 2) e o roteamento por idioma. Trocar de ou
      para ela deixaria a prova com os simulados da outra regra. Para a
      compartilhada como DESTINO, a regra do dono abaixo já recusa.
    */
    if ((prova.categoria as Categoria)?.dono === DONO_CURSINHO) {
      throw new BadRequestException(TEXTO_CATEGORIA_ENEM_CURSINHO);
    }
    const categoria = await this.categorias.getVivaById(categoriaId);
    if (
      !categoria ||
      categoria.dono !== ator.cursinhoId ||
      categoria.selecionavel === false
    ) {
      throw new BadRequestException(TEXTO_CATEGORIA_INVALIDA);
    }
    /*
      ⚠️ Cartão ENVIADO: o histórico guarda a categoria por referência, e a
      duração e o total do relatório mudariam no passado. Cartão GERADO: a
      folha impressa tem o layout da categoria antiga, e a leitura de uma
      folha com 90 bolhas num template de 45 sairia errada.
    */
    if (await this.historicos.contarPorSimulados(this.simuladoIds(prova))) {
      throw new ConflictException(TEXTO_JA_FEITA_CATEGORIA);
    }
    const simulados = (prova.simulados ?? []) as Simulado[];
    if (simulados.some((s) => (s.cartaoSeq ?? 0) > 0)) {
      throw new ConflictException(TEXTO_CARTAO_EMITIDO);
    }
    const total = categoria.quantidadeTotalQuestao;
    if (total != null) {
      const acima = (prova.questoes ?? [])
        .map((qc) => qc.numero)
        .filter((n): n is number => typeof n === 'number' && n > total)
        .sort((a, b) => a - b);
      if (acima.length) {
        throw new ConflictException(
          `A categoria nova tem ${total} questões, e a prova tem questões com número acima disso (${acima.join(', ')}). Tire ou renumere essas questões antes.`,
        );
      }
    }
    return categoria;
  }

  /** O simulado 1:1 segue a categoria: total, descrição e bloqueio. */
  private async trocarCategoriaDosSimulados(
    prova: Prova,
    categoria: Categoria,
  ) {
    for (const simulado of (prova.simulados ?? []) as Simulado[]) {
      simulado.categoria = categoria;
      simulado.descricao = `${categoria.exame?.nome ?? simulado.descricao}`;
      revalidarBloqueado(simulado);
      await this.simulados.updateSession(simulado);
    }
  }

  async excluir(id: string, ator?: Ator): Promise<{ nome: string }> {
    const prova = await this.provaDoAtor(id, ator);
    if (await this.historicos.contarPorSimulados(this.simuladoIds(prova))) {
      throw new ConflictException(TEXTO_JA_FEITA_EXCLUIR);
    }
    await this.provas.arquivar(id);
    await this.simulados.arquivarDaProva(this.simuladoIds(prova));
    await this.auditLog.create({
      user: ator!.userId,
      entityId: id,
      entityType: 'Prova',
      changes: JSON.stringify({
        acao: 'excluir',
        nome: prova.nome,
        questoes: (prova.questoes ?? []).length,
        cursinhoId: ator!.cursinhoId,
      }),
    });
    return { nome: prova.nome };
  }
}
