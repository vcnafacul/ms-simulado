import { Module } from '@nestjs/common';
import { SimuladoModule } from '../simulado/simulado.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { HistoricoModule } from '../historico/historico.module';
import { EnvModule } from '../../shared/modules/env/env.module';
import { CartaoRespostaService } from './cartao-resposta.service';
import { TemplateProvisionService } from './template-provision.service';
import { OmrHttpService } from './omr-http.service';
import { CartaoHistoricoService } from './cartao-historico.service';
import { CartaoRespostaController } from './cartao-resposta.controller';

@Module({
  imports: [SimuladoModule, StorageModule, HistoricoModule, EnvModule],
  controllers: [CartaoRespostaController],
  providers: [
    CartaoRespostaService,
    TemplateProvisionService,
    OmrHttpService,
    CartaoHistoricoService,
  ],
  exports: [CartaoRespostaService],
})
export class CartaoRespostaModule {}
