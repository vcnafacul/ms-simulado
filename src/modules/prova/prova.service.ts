import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import { AuditLogService } from '../auditLog/auditLog.service';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';
import { UpdateProvaFilesDTO } from './dtos/update-files.dto.input';
import { revalidarBloqueado } from '../simulado/helpers/bloqueado';
import {
  resolveQuestaoId,
  syncNumeroNaProvaESimulados,
} from './helpers/question-container.helpers';
import {
  atualizacoesDaProva,
  Atualizacao,
  PROFUNDIDADE_MAXIMA,
} from './helpers/atualizacoes-da-prova';
import {
  podeComporProva,
  motivoParaNaoComporProva,
  ResumoDoDono,
  resumoDoDono,
} from './helpers/pode-compor-prova';

@Injectable()
export class ProvaService {
  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly categoriaRepository: CategoriaRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * ⚠️ Antes de qualquer escrita na composição da prova (tickets/023, card
   * 03). 404 se a prova não existe; 403 com o motivo se o ator não pode.
   */
  public async assertPodeComporProva(provaId: string, ator?: Ator) {
    const prova = await this.repository.getDonoDaProva(provaId);
    if (!prova) {
      throw new NotFoundException(`Prova com ID ${provaId} não encontrada.`);
    }
    const motivo = motivoParaNaoComporProva(prova, ator);
    if (motivo) throw new ForbiddenException(motivo);
  }

  /**
   * Liga/desliga o "aplicar novas versões automaticamente" (tickets/023, card
   * 05). Só o dono da prova (R2).
   *
   * ⚠️ `$set` do campo, nunca o `repository.update(prova)`: `approvedQuestion`,
   * `refuseQuestion` e `updateFiles` regravam o documento inteiro, e um deles
   * rodando junto desfaria a troca — ou esta desfaria a deles.
   */
  public async alterarReceberNovasVersoes(
    id: string,
    valor: boolean,
    ator?: Ator,
  ): Promise<{ receberNovasVersoes: boolean }> {
    await this.assertPodeComporProva(id, ator);
    const de = await this.repository.setReceberNovasVersoes(id, valor);
    await this.auditLogService?.create({
      user: ator!.userId,
      entityId: id,
      entityType: 'Prova',
      changes: JSON.stringify({
        acao: 'receberNovasVersoes',
        de,
        para: valor,
        cursinhoId: ator!.cursinhoId,
      }),
    });
    return { receberNovasVersoes: valor };
  }

  /**
   * O que mudou nas questões desta prova desde que foi montada (tickets/023,
   * card 13). Ler é livre (R1); `podeComporProva` diz se a tela oferece
   * "aplicar" (card 14).
   */
  public async listarAtualizacoes(
    id: string,
    ator?: Ator,
  ): Promise<{ podeComporProva: boolean; atualizacoes: Atualizacao[] }> {
    const prova = await this.repository.getComposicao(id);
    if (!prova) {
      throw new NotFoundException(`Prova com ID ${id} não encontrada.`);
    }
    const atualizacoes = await atualizacoesDaProva(
      (prova.questoes ?? []).map((qc) => ({
        numero: qc.numero ?? null,
        questaoId: resolveQuestaoId(qc),
      })),
      {
        questoes: (ids) => this.questaoRepository.questoesDaCadeia(ids),
        sucessoras: (ids) => this.questaoRepository.sucessorasDeVersao(ids),
      },
    );
    return { podeComporProva: podeComporProva(prova, ator), atualizacoes };
  }

  /**
   * Aplica versões novas NESTA prova e nos simulados dela (tickets/023, card
   * 14). Só o dono (R2). Tudo ou nada: valida todas as trocas antes de
   * escrever, e escreve numa transação.
   *
   * Cada troca: `de` está na prova; `para` é DESCENDENTE de `de` na cadeia de
   * versões (qualquer outra questão seria "adicionar", que tem rota própria);
   * `para` não está na prova; `para` viva (a cadeia só segue as vivas).
   * Pode ser `Pending`. O histórico de quem já fez segue com `de`.
   */
  public async aplicarAtualizacoes(
    id: string,
    trocas: { de: string; para: string }[],
    ator?: Ator,
  ): Promise<{ trocadas: number; simulados: number }> {
    await this.assertPodeComporProva(id, ator);
    const prova = await this.repository.getComposicao(id);
    const naProva = new Set(
      (prova!.questoes ?? []).map((qc) => resolveQuestaoId(qc)),
    );

    const destinos = new Set<string>();
    for (const { de, para } of trocas) {
      if (!naProva.has(de)) {
        throw new BadRequestException(`A questão ${de} não está nesta prova.`);
      }
      if (naProva.has(para) || destinos.has(para)) {
        throw new BadRequestException(`A questão ${para} já está nesta prova.`);
      }
      if (!(await this.ehDescendente(de, para))) {
        throw new BadRequestException(
          `A questão ${para} não é uma versão mais nova de ${de}.`,
        );
      }
      destinos.add(para);
    }

    const simuladoIds = (prova!.simulados ?? []) as unknown[];
    let simulados = 0;
    await this.emTransacao(async (session) => {
      for (const { de, para } of trocas) {
        simulados += await this.questaoRepository.trocarNaProva(
          id,
          simuladoIds,
          de,
          para,
          session,
        );
      }
    });
    // Aprovada trocada por pendente derruba o contador.
    await this.questaoRepository.recalcularTotalValidadas([id]);
    /*
      ⚠️ tickets/023, card 19: a regra do card 18 vale aqui também — a
      original que saiu da ÚLTIMA prova que a usava congela (é o que o
      histórico aponta). Se outra prova ainda a usa, segue viva e editável.
    */
    for (const { de } of trocas) {
      if (!(await this.questaoRepository.findProvaAtual(de))) {
        await this.questaoRepository.congelar(de);
      }
    }

    for (const { de, para } of trocas) {
      await this.auditLogService?.create({
        user: ator!.userId,
        entityId: id,
        entityType: 'Prova',
        changes: JSON.stringify({
          acao: 'aplicarVersao',
          provaId: id,
          de,
          para,
          cursinhoId: ator!.cursinhoId,
        }),
      });
    }
    return { trocadas: trocas.length, simulados };
  }

  /**
   * Uma transação, como o `removerDeProva` (prod é replica set). Separada
   * para os testes com Mongo standalone, que não tem transação — lá a
   * validação-antes-de-escrever é o que garante o "tudo ou nada" dos 400.
   */
  private async emTransacao(
    escrever: (session: ClientSession) => Promise<void>,
  ): Promise<void> {
    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      await escrever(session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /** `para` está na cadeia de versões a partir de `de` (vivas, até 50). */
  private async ehDescendente(de: string, para: string): Promise<boolean> {
    let atual = de;
    const visitadas = new Set([de]);
    for (let i = 0; i < PROFUNDIDADE_MAXIMA; i++) {
      const s = (await this.questaoRepository.sucessorasDeVersao([atual])).get(
        atual,
      );
      if (!s || visitadas.has(String(s._id))) return false;
      if (String(s._id) === para) return true;
      visitadas.add(String(s._id));
      atual = String(s._id);
    }
    return false;
  }

  public async create(item: CreateProvaDTOInput): Promise<GetProvaDTOOutout> {
    /*
      ⚠️ Antes de tudo: a fábrica cria os simulados antes da prova e sem
      transação, então qualquer recusa depois disso deixaria lixo.
    */
    const categoria = await this.categoriaRepository.getVivaById(
      item.categoria,
    );
    if (!categoria) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    // tickets/023, card 04 (R3): cursinho só cria prova em categoria dele.
    // Senão criaria uma prova protegida que nem ele compõe (R2).
    if (item.cursinhoId && categoria.dono !== item.cursinhoId) {
      throw new ForbiddenException(
        'Use uma categoria do seu cursinho para criar a prova.',
      );
    }
    const factory = this.provaFactory.getFactory(categoria, item.ano);
    try {
      const prova = await factory.createProva(item);
      await factory.createSimulados(prova);

      const result = await this.repository.create(prova);
      return {
        _id: result._id,
        edicao: result.edicao,
        aplicacao: result.aplicacao,
        ano: result.ano,
        categoria: result.categoria.nome,
        exame: result.categoria.exame.nome,
        nome: result.nome,
        totalQuestao: result.totalQuestao,
        totalQuestaoCadastradas: result.questoes.length,
        totalQuestaoValidadas: result.totalQuestaoValidadas,
        filename: result.filename,
        gabarito: result.gabarito,
        enemAreas: result.enemAreas,
        createdAt: result.createdAt,
        receberNovasVersoes: result.receberNovasVersoes,
      } as GetProvaDTOOutout;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  /**
   * A prova para a tela, com dono, proteção e se o ator pode compor
   * (tickets/023, card 07). Ler é livre (R1): quem barra escrita é o assert.
   */
  public async getByIdComDono(
    id: string,
    ator?: Ator,
  ): Promise<(Prova & ResumoDoDono) | null> {
    const prova = await this.repository.getById(id);
    if (!prova) return null;
    return {
      ...((prova as any).toObject ? (prova as any).toObject() : prova),
      ...resumoDoDono(prova, ator),
    };
  }

  public async syncNumero(
    provaId: string,
    questaoId: string,
    numero: number | null,
  ): Promise<void> {
    await syncNumeroNaProvaESimulados(
      this.repository,
      this.simuladoRepository,
      provaId,
      questaoId,
      numero,
    );
  }

  private toProvaDTO(prova: Prova): GetProvaDTOOutout {
    return {
      _id: prova._id,
      edicao: prova.edicao,
      aplicacao: prova.aplicacao,
      ano: prova.ano,
      categoria: prova.categoria.nome,
      exame: prova.categoria.exame.nome,
      nome: prova.nome,
      totalQuestao: prova.totalQuestao,
      gabarito: prova.gabarito,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      enemAreas: prova.enemAreas,
      totalQuestaoCadastradas: prova.questoes.length,
      createdAt: prova.createdAt,
      receberNovasVersoes: prova.receberNovasVersoes,
    } as GetProvaDTOOutout;
  }

  public async getAll(
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll(param);
    return {
      ...provas,
      data: provas.data.map((prova) => this.toProvaDTO(prova)),
    };
  }

  public async getAllByCursinho(
    cursinhoId: string,
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll({
      ...param,
      where: { cursinhoId },
    });
    return {
      ...provas,
      data: provas.data.map((prova) => this.toProvaDTO(prova)),
    };
  }

  public async approvedQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas contando a questão sendo aprovada
    prova.totalQuestaoValidadas = prova.questoes.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return true;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.find(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // A aprovação ainda não foi persistida: entra no cálculo como em trânsito.
        revalidarBloqueado(simulado, { questaoId: questionId, aprovada: true });
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async refuseQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas excluindo a questão sendo rejeitada
    prova.totalQuestaoValidadas = prova.questoes.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return false;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.some(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // A rejeição ainda não foi persistida: entra no cálculo como em trânsito.
        revalidarBloqueado(simulado, {
          questaoId: questionId,
          aprovada: false,
        });
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async getMissingNumbers(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const factory = this.provaFactory.getFactory(prova.categoria, prova.ano);
    return factory.getMissingNumbers(prova);
  }

  public async ValidatorProvaWithEnemArea(id: string, enemArea: EnemArea) {
    const prova = await this.repository.getById(id);
    if (
      (prova.nome.includes('Dia 1') &&
        ![EnemArea.CienciasHumanas, EnemArea.Linguagens].includes(enemArea)) ||
      (prova.nome.includes('Dia 2') &&
        ![EnemArea.BioExatas, EnemArea.Matematica].includes(enemArea))
    ) {
      throw new HttpException(
        'Area do conhecimento não coincide com a prova',
        HttpStatus.CONFLICT,
      );
    }
  }

  async getSummary() {
    const provaTotal = await this.repository.getTotalEntity();
    return {
      provaTotal,
    };
  }

  public async updateFiles(
    id: string,
    dto: UpdateProvaFilesDTO,
  ): Promise<GetProvaDTOOutout> {
    const prova = await this.repository.getById(id);

    if (!prova) {
      throw new HttpException('Prova não encontrada', HttpStatus.NOT_FOUND);
    }
    if (!dto.filename && !dto.gabarito) {
      throw new HttpException(
        'Nenhum campo para atualizar',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.filename) {
      prova.filename = dto.filename;
    }

    if (dto.gabarito) {
      prova.gabarito = dto.gabarito;
    }

    await this.repository.update(prova);

    return {
      _id: prova._id,
      edicao: prova.edicao,
      aplicacao: prova.aplicacao,
      ano: prova.ano,
      categoria: prova.categoria.nome,
      exame: prova.categoria.exame.nome,
      nome: prova.nome,
      totalQuestao: prova.totalQuestao,
      totalQuestaoCadastradas: prova.questoes.length,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      gabarito: prova.gabarito,
      enemAreas: prova.enemAreas,
      createdAt: prova.createdAt,
      receberNovasVersoes: prova.receberNovasVersoes,
    } as GetProvaDTOOutout;
  }
}
