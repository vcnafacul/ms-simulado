import { Injectable, Logger } from '@nestjs/common';
import { QueueProducer } from '../../shared/modules/queue/queue.producer';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../historico/historico.repository';
import { SimuladoRepository } from '../simulado/simulado.repository';

interface CartaoCallbackInput {
  imageKey: string;
  respostas?: { questao: string; alternativaEstudante: string }[];
  falha?: { motivo: string; detalhe?: string };
}

@Injectable()
export class CartaoCallbackService {
  private readonly logger = new Logger(CartaoCallbackService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly queueProducer: QueueProducer,
  ) {}

  async processar(input: CartaoCallbackInput): Promise<void> {
    const historico = await this.historicoRepository.findByImageKey(
      input.imageKey,
    );
    if (!historico) {
      this.logger.warn(
        `callback sem histórico para imageKey ${input.imageKey}`,
      );
      return;
    }
    const histId = (
      historico as unknown as { _id: { toString(): string } }
    )._id.toString();

    if (input.falha) {
      await this.historicoRepository.updateStatus(
        histId,
        HistoricoStatus.Failed,
      );
      return;
    }

    const simuladoId =
      (historico.simulado as any)?._id?.toString() ??
      historico.simulado.toString();
    const simulado = await this.simuladoRepository.answer(simuladoId);
    if (!simulado) {
      this.logger.warn(
        `callback: simulado ${simuladoId} não encontrado (histórico ${histId}) → Failed`,
      );
      await this.historicoRepository.updateStatus(
        histId,
        HistoricoStatus.Failed,
      );
      return;
    }

    const numeroToId = new Map<number, string>();
    for (const qc of simulado.questoes) {
      numeroToId.set(qc.numero, (qc.questao as any)._id.toString());
    }

    const rawRespostas = (input.respostas ?? [])
      .map((r) => {
        const questaoId = numeroToId.get(Number(r.questao));
        return questaoId
          ? { questao: questaoId, alternativaEstudante: r.alternativaEstudante }
          : null;
      })
      .filter(
        (r): r is { questao: string; alternativaEstudante: string } =>
          r !== null,
      );

    await this.historicoRepository.prepararParaProcessamento(
      histId,
      rawRespostas,
    );
    await this.queueProducer.publish('stream:simulado:answers', { histId });
  }
}
