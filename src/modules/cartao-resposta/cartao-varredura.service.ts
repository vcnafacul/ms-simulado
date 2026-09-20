import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';

/**
 * Quanto tempo um cartão pode ficar em `awaiting_omr` antes de ser considerado
 * perdido.
 *
 * ⚠️ **60 minutos, e não os ~15 que o pior caso de processamento sugeriria.**
 * MEDIDO no ms-omr: `job_timeout` 180s × `max_tries` 3 + backoff de 30s e 60s
 * = 630s (10,5 min). Mas o processamento não é o que domina:
 * `omr_max_workers = cpu_count() - 1` e a VPS tem **1 vCPU**, ou seja **um
 * worker, em série**. Numa turma que sobe 50 cartões, o último espera 49
 * leituras na fila antes de começar.
 *
 * Uma janela curta mataria cartão que ia terminar — e a varredura viraria a
 * causa do problema que deveria resolver.
 */
export const JANELA_MINUTOS = 60;

@Injectable()
export class CartaoVarreduraService {
  private readonly logger = new Logger(CartaoVarreduraService.name);

  constructor(private readonly historicoRepository: HistoricoRepository) {}

  /**
   * ⚠️ **Periódico, não só na subida.** O `recoverPending()` do
   * `AnswerProcessorService` roda no boot e cobre apenas `Pending` e
   * `Processing`; um processo pode não reiniciar por dias.
   *
   * ⚠️ **Seguro sob múltiplas instâncias**, e isto é design e não sorte: a
   * consulta filtra por `status: awaiting_omr`, então uma segunda instância
   * concorrente não encontra mais nada, e remarcar um `failed` como `failed`
   * com o mesmo motivo não altera o documento.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async varrerAgendado(): Promise<void> {
    await this.varrer(new Date());
  }

  /** `agora` é parâmetro para o teste não depender do relógio. */
  async varrer(agora: Date): Promise<void> {
    const corte = new Date(agora.getTime() - JANELA_MINUTOS * 60_000);
    const presos = await this.historicoRepository.findAwaitingOmrAntigos(corte);

    if (presos.length === 0) return;

    this.logger.warn(
      `${presos.length} cartão(ões) parado(s) em awaiting_omr há mais de ${JANELA_MINUTOS} min`,
    );

    for (const preso of presos) {
      const id = (preso as any)._id.toString();
      try {
        await this.historicoRepository.marcarFalha(
          id,
          CodigoFalhaInterno.LeituraNaoRetornou,
          `sem callback do OMR após ${JANELA_MINUTOS} minutos`,
        );
      } catch (err) {
        // ⚠️ Um documento que estoura não pode levar os outros junto: isto roda
        // sozinho, e se a exceção subir os demais ficam presos até a próxima
        // volta — ou para sempre, se o erro for determinístico.
        this.logger.error(
          `falha ao marcar ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
