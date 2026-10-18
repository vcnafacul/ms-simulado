import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueConsumer } from 'src/shared/modules/queue/queue.consumer';
import {
  RecalculoAnulacaoService,
  STREAM_RECALCULO,
} from './recalculo-anulacao.service';

/** tickets/042, card 12: um job por vez; no boot, retoma os ativos (R5). */
@Injectable()
export class RecalculoAnulacaoConsumer implements OnModuleInit {
  constructor(
    private readonly consumer: QueueConsumer,
    private readonly service: RecalculoAnulacaoService,
  ) {}

  async onModuleInit() {
    this.consumer.register(
      STREAM_RECALCULO,
      'recalculo-anulacao',
      'recalculo-1',
      (_id, campos) => this.service.enfileirar(campos.jobId),
    );
    await this.service.retomar();
  }
}
