import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueConsumer } from 'src/shared/modules/queue/queue.consumer';
import { QueueProducer } from 'src/shared/modules/queue/queue.producer';
import { HistoricoRepository } from '../historico/historico.repository';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { SimuladoService } from './simulado.service';

@Injectable()
export class AnswerProcessorService implements OnModuleInit {
  private readonly logger = new Logger(AnswerProcessorService.name);

  constructor(
    private readonly consumer: QueueConsumer,
    private readonly simuladoService: SimuladoService,
    private readonly historicoRepository: HistoricoRepository,
    private readonly producer: QueueProducer,
  ) {}

  async onModuleInit() {
    this.consumer.register(
      'stream:simulado:answers',
      'answer-processors',
      'processor-1',
      (_id, fields) => this.handleMessage(fields.histId),
    );

    await this.recoverPending();
  }

  private async recoverPending() {
    const stale = await this.historicoRepository.findByStatuses([
      HistoricoStatus.Pending,
      HistoricoStatus.Processing,
    ]);

    if (stale.length > 0) {
      this.logger.log(`Recovering ${stale.length} unprocessed historicos`);
    }

    for (const h of stale) {
      await this.producer.publish('stream:simulado:answers', {
        histId: (h as any)._id.toString(),
      });
    }
  }

  private async handleMessage(histId: string) {
    const historico = await this.historicoRepository.getById(histId);
    if (!historico) {
      this.logger.warn(`Historico ${histId} not found, skipping`);
      return;
    }
    if ((historico as any).status === HistoricoStatus.Completed) return;

    const userId = historico.usuario;

    await this.simuladoService.processAnswer(histId);

    await this.producer.publish('stream:vcnafacul:events', {
      type: 'historico-completed',
      userId,
      historicoId: histId,
    });

    this.logger.log(`Processed historico ${histId} for user ${userId}`);
  }
}
