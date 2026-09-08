import {
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
import { nomeDoArquivo } from './nome-do-arquivo';
import { montarZip } from './zip';

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
  ) {}

  async gerarZip(
    simuladoId: string,
    opts: { draft: boolean },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }> {
    const inicio = Date.now();

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

    const caderno = gerarCaderno(simulado as unknown as SimuladoParaCaderno, {
      draft: opts.draft,
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

    const { conteudo, total } = juntarAvisos.comTotal(
      caderno.conteudo,
      resolucao.avisos,
    );

    const buffer = await montarZip({
      conteudo,
      metadados: caderno.metadados,
      imagens: resolucao.arquivos,
    });

    this.logger.log(
      `caderno ${simuladoId} draft=${opts.draft} ` +
        `questoes=${caderno.questoesIncluidas.length} ` +
        `imagens=${resolucao.arquivos.length} ` +
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
