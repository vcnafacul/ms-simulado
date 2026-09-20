import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { Historico } from '../historico/historico.schema';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { OmrHttpService } from './omr-http.service';

/**
 * ⚠️ **60 segundos, e a escolha é livre de propósito.** O card original amarrava
 * a janela ao TTL do cache de imagem ("≥ 180s"), porque reusar a `imageKey`
 * fazia o OMR poder ler a foto velha. Medido: o TTL real chega a 3600s do lado
 * do ms-omr, o que tornaria a regra uma hora de espera. Cunhando chave nova a
 * cada troca, a amarra deixa de existir — e a janela passa a ser só ergonomia.
 *
 * Como o limite é POR HISTÓRICO, quem corrige dez cartões diferentes em
 * sequência nunca esbarra nele.
 */
export const JANELA_ENTRE_TENTATIVAS_MS = 60_000;

@Injectable()
export class CartaoReprocessoService {
  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
    private readonly omrHttp: OmrHttpService,
  ) {}

  async reprocessar(params: {
    historicoId: string;
    cursinhoId: string;
    imageKey?: string;
    simuladoId?: string;
    cartaoCode?: string;
    agora: Date;
  }): Promise<void> {
    // ⚠️ O gate. `cursinhoId` no filtro já não encontra histórico alheio — e o
    // valor vem do JWT, no corpo, nunca de um segmento de caminho.
    const linha = await this.relatorioRepository.buscarPorHistorico(
      params.historicoId,
      params.cursinhoId,
    );
    if (!linha) {
      throw new NotFoundException('cartão não encontrado neste cursinho');
    }

    // ⚠️ **`getByFilter`, e não o `getById` deste repositório.** O `getById`
    // faz `populate` de `simulado` (com `questoes.questao` dentro), o que
    // (a) carrega o simulado inteiro só para ler três campos e (b) faz
    // `historico.simulado` virar um Document — e `String(...)` de um Document
    // do mongoose devolve o dump do objeto, não o id, de modo que a
    // conferência de QR abaixo recusaria até a foto certa.
    const historico = (await this.historicoRepository.getByFilter({
      _id: params.historicoId,
    })) as Historico | null;
    if (!historico) {
      throw new NotFoundException('histórico não encontrado');
    }

    // ⚠️ Só cartão falho se reprocessa. Um que está lendo abriria corrida com
    // o callback em voo; um que já leu não tem o que reprocessar.
    if (historico.status !== HistoricoStatus.Failed) {
      throw new ConflictException(
        `só cartão com falha pode ser reprocessado (está ${historico.status})`,
      );
    }

    this.recusarSeCedoDemais(historico.ultimaTentativaEm, params.agora);

    if (params.imageKey !== undefined) {
      this.recusarSeOutroCartao(historico, params);
    }

    await this.historicoRepository.reabrirParaOmr(params.historicoId, {
      ...(params.imageKey !== undefined ? { imageKey: params.imageKey } : {}),
      quando: params.agora,
    });

    try {
      await this.omrHttp.enviarProcessamento(
        params.imageKey ?? historico.imageKey,
      );
    } catch (err) {
      // ⚠️ Sem isto o histórico fica em `awaiting_omr` para sempre e some do
      // relatório como "processando", sem ninguém para consertar.
      //
      // ⚠️ E o diagnóstico ORIGINAL já foi apagado pelo `$unset` — a pessoa
      // acabou de agir sobre ele, então a perda é aceitável, mas é uma perda.
      await this.historicoRepository.marcarFalha(
        params.historicoId,
        CodigoFalhaInterno.OmrIndisponivel,
        err instanceof Error ? err.message : String(err),
      );
      throw new BadGatewayException('falha ao acionar o OMR');
    }
  }

  /**
   * ⚠️ A recusa diz **quanto falta**. Um 429 sem número manda a pessoa tentar
   * de novo na hora, e de novo.
   */
  private recusarSeCedoDemais(ultima: Date | undefined, agora: Date): void {
    // Ausente = nunca tentou. Documento anterior a este card passa direto.
    if (!ultima) return;

    const decorrido = agora.getTime() - new Date(ultima).getTime();
    if (decorrido >= JANELA_ENTRE_TENTATIVAS_MS) return;

    const faltam = Math.ceil((JANELA_ENTRE_TENTATIVAS_MS - decorrido) / 1000);
    throw new ConflictException(
      `aguarde ${faltam}s para tentar novamente neste cartão`,
    );
  }

  /**
   * ⚠️ **O coordenador escolhe o arquivo à mão.** Sem esta conferência, a folha
   * de outro aluno — ou de outro simulado — entra neste histórico, e o
   * relatório fica convincentemente errado.
   */
  private recusarSeOutroCartao(
    historico: { simulado: unknown; cartaoCode?: string },
    params: { simuladoId?: string; cartaoCode?: string },
  ): void {
    const simuladoDoHistorico = String(historico.simulado);
    if (params.simuladoId !== simuladoDoHistorico) {
      throw new BadRequestException('a foto enviada é de outro simulado');
    }
    if (params.cartaoCode !== historico.cartaoCode) {
      throw new BadRequestException('a foto enviada é de outro cartão');
    }
  }
}
