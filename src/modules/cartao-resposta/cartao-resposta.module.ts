import { Module } from '@nestjs/common';
import { SimuladoModule } from '../simulado/simulado.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { CartaoRespostaService } from './cartao-resposta.service';
import { TemplateProvisionService } from './template-provision.service';
import { CartaoRespostaController } from './cartao-resposta.controller';

@Module({
  imports: [SimuladoModule, StorageModule],
  controllers: [CartaoRespostaController],
  providers: [CartaoRespostaService, TemplateProvisionService],
  exports: [CartaoRespostaService],
})
export class CartaoRespostaModule {}
