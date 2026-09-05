import { Module } from '@nestjs/common';
import { SimuladoModule } from '../simulado/simulado.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { HistoricoModule } from '../historico/historico.module';
import { EnvModule } from '../../shared/modules/env/env.module';
import { QueueModule } from '../../shared/modules/queue/queue.module';
import { CartaoRespostaService } from './cartao-resposta.service';
import { TemplateProvisionService } from './template-provision.service';
import { OmrHttpService } from './omr-http.service';
import { CartaoHistoricoService } from './cartao-historico.service';
import { CartaoCallbackService } from './cartao-callback.service';
import { CartaoRespostaController } from './cartao-resposta.controller';

@Module({
  imports: [
    SimuladoModule,
    StorageModule,
    HistoricoModule,
    EnvModule,
    QueueModule,
  ],
  controllers: [CartaoRespostaController],
  providers: [
    CartaoRespostaService,
    TemplateProvisionService,
    OmrHttpService,
    CartaoHistoricoService,
    CartaoCallbackService,
  ],
  exports: [CartaoRespostaService],
})
export class CartaoRespostaModule {}
