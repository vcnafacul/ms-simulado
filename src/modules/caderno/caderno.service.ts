import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnvService } from '../../shared/modules/env/env.service';
import { SimuladoService } from '../simulado/simulado.service';
import { juntarAvisos } from './avisos';
import { gerarCaderno } from './gerador/gerar-caderno';
import { SimuladoParaCaderno } from './gerador/tipos';
import { ResolverDeImagens } from './imagens/resolver';
import { avisosDosLogos, LogosDoCaderno, temLogo } from './logos';
import { nomeDoArquivo } from './nome-do-arquivo';
import { CadernoTemplateService } from './template/caderno-template.service';
import { montarZip } from './zip';
import { ProvaRepository } from '../prova/prova.repository';
import { DONO_CURSINHO } from '../categoria/schemas/categoria.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { montarCadernoDaProva } from './gerador/caderno-da-prova';

/**
 * O caminho completo: portão → gerador → resolvedor → avisos → zip.
 *
 * ⚠️ **O endpoint tem UM portão, e é `simulado.bloqueado`.** Ele não inspeciona
 * propriedade interna do simulado para decidir se merece virar caderno: quem
 * decide se um simulado está pronto é o fluxo que **calcula** `bloqueado`.
 * Auditar isso aqui seria o caderno fiscalizando trabalho alheio — e mal,
 * porque ele não teria como saber se "zero questões" é defeito ou estado
 * válido daquela categoria.
 */

const MENSAGEM_BLOQUEADO =
  'simulado não está pronto (questões pendentes ou incompletas)';

@Injectable()
export class CadernoService {
  private readonly logger = new Logger(CadernoService.name);

  constructor(
    private readonly simuladoService: SimuladoService,
    private readonly resolver: ResolverDeImagens,
    private readonly env: EnvService,
    private readonly template: CadernoTemplateService,
    private readonly provas: ProvaRepository,
  ) {}

  async gerarZip(
    simuladoId: string,
    opts: { draft: boolean; logos?: LogosDoCaderno },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }> {
    if (opts.draft && !this.env.get('CADERNO_DRAFT_ENABLED')) {
      throw new ForbiddenException('geração de rascunho desabilitada');
    }

    const simulado = await this.simuladoService.getById(simuladoId);
    if (!simulado) throw new NotFoundException('simulado não encontrado');

    // Mesma leitura e MESMA MENSAGEM do TemplateProvisionService: duas
    // features que recusam pelo mesmo motivo não podem divergir no texto.
    if (simulado.bloqueado && !opts.draft) {
      throw new ConflictException(MENSAGEM_BLOQUEADO);
    }

    return this.empacotar(
      simuladoId,
      simulado as unknown as SimuladoParaCaderno,
      opts,
    );
  }

  /**
   * Caderno DA PROVA (tickets/038, R5/R6) — Enem Dia 1/2 do cursinho. Dia 1: 1–5 Inglês, 1–5
   * Espanhol e 6–90, com o título de cada língua; Dia 2: 91–180. Só com TODOS os simulados
   * prontos. Sem rascunho.
   */
  async gerarZipDaProva(
    provaId: string,
    opts: { logos?: LogosDoCaderno },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }> {
    const prova = await this.provas.getById(provaId);
    if (!prova || (prova as { deleted?: boolean }).deleted) {
      throw new NotFoundException('prova não encontrada');
    }
    if (prova.categoria?.dono !== DONO_CURSINHO) {
      throw new BadRequestException(
        'O caderno da prova existe só para as provas Enem Dia 1 e Enem Dia 2 do cursinho.',
      );
    }
    const ids = ((prova.simulados ?? []) as Simulado[]).map((s) =>
      String(s._id),
    );
    // ⚠️ Pelo SimuladoService: é ele que popula as questões com o que o
    // gerador precisa (o `getById` da prova não traz o texto pronto).
    const simulados = (
      await Promise.all(ids.map((id) => this.simuladoService.getById(id)))
    ).filter((s): s is Simulado => !!s);
    if (!simulados.length || simulados.some((s) => s.bloqueado !== false)) {
      throw new ConflictException(
        'Todos os simulados da prova precisam estar completos para gerar o caderno da prova.',
      );
    }

    const conteudo = montarCadernoDaProva(
      {
        nome: prova.nome,
        categoria:
          prova.categoria as unknown as SimuladoParaCaderno['categoria'],
      },
      simulados as unknown as Parameters<typeof montarCadernoDaProva>[1],
    );
    return this.empacotar(provaId, conteudo, {
      draft: false,
      logos: opts.logos,
      manterOrdem: true,
    });
  }

  private async empacotar(
    id: string,
    simulado: SimuladoParaCaderno,
    opts: { draft: boolean; logos?: LogosDoCaderno; manterOrdem?: boolean },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }> {
    const inicio = Date.now();
    const simuladoId = id;

    // Sem versão publicada isto lança 503, e é para lançar: não existe
    // fallback ao disco. Ver o card 10.
    const templatePublicado = await this.template.publicada();

    const caderno = gerarCaderno(simulado, {
      draft: opts.draft,
      manterOrdem: opts.manterOrdem,
    });

    let resolucao;
    try {
      resolucao = await this.resolver.resolver(caderno.imagens);
    } catch (erro) {
      // A única exceção que o resolvedor levanta é configuração ausente.
      // Seguir sem ela transformaria toda imagem em "não encontrada", que
      // manda procurar a imagem em vez da configuração.
      throw new ServiceUnavailableException((erro as Error).message);
    }

    // Avisos de logos (fixo, até 2) primeiro, depois avisos de imagens
    // (unbounded). Um coordenador abre conteudo.tex e lê de cima para baixo;
    // com 30 imagens faltando, a marca do cursinho não pode estar na linha 35.
    const { conteudo, total } = juntarAvisos.comTotal(caderno.conteudo, [
      ...avisosDosLogos(opts.logos),
      ...resolucao.avisos,
    ]);

    const buffer = await montarZip({
      template: templatePublicado.arquivos,
      conteudo,
      metadados: caderno.metadados,
      imagens: resolucao.arquivos,
      logos: opts.logos,
    });

    this.logger.log(
      `caderno ${simuladoId} draft=${opts.draft} ` +
        `template=${templatePublicado.versao} ` +
        `questoes=${caderno.questoesIncluidas.length} ` +
        `imagens=${resolucao.arquivos.length} ` +
        `logos=${Object.values(opts.logos ?? {}).filter(temLogo).length} ` +
        `cache=${resolucao.metricas.doCache} bucket=${resolucao.metricas.doBucket} ` +
        `internet=${resolucao.metricas.daInternet} ` +
        `bytes=${buffer.length} avisos=${total} ms=${Date.now() - inicio}`,
    );

    return {
      nome: nomeDoArquivo(simulado.nome, simuladoId),
      buffer,
      avisos: total,
    };
  }
}
