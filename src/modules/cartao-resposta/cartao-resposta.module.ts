import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SimuladoModule } from '../simulado/simulado.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { HistoricoModule } from '../historico/historico.module';
import { RelatorioSimuladoEstudanteModule } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.module';
import { EnvModule } from '../../shared/modules/env/env.module';
import { QueueModule } from '../../shared/modules/queue/queue.module';
import { CartaoRespostaService } from './cartao-resposta.service';
import { TemplateProvisionService } from './template-provision.service';
import { OmrHttpService } from './omr-http.service';
import { CartaoHistoricoService } from './cartao-historico.service';
import { CartaoCallbackService } from './cartao-callback.service';
import { CartaoReprocessoService } from './cartao-reprocesso.service';
import { CartaoImagemService } from './cartao-imagem.service';
import { CartaoVarreduraService } from './cartao-varredura.service';
import { CartaoRespostaController } from './cartao-resposta.controller';
import { QuestaoModule } from '../questao/questao.module';
import {
  CartaoExcluido,
  CartaoExcluidoSchema,
} from './exclusao/cartao-excluido.schema';
import { CartaoExcluidoRepository } from './exclusao/cartao-excluido.repository';
import { CartaoExclusaoService } from './exclusao/cartao-exclusao.service';

@Module({
  imports: [
    SimuladoModule,
    StorageModule,
    HistoricoModule,
    RelatorioSimuladoEstudanteModule,
    EnvModule,
    QueueModule,
    // Card 36: o "Excluir envio" desconta os contadores das questões.
    QuestaoModule,
    MongooseModule.forFeature([
      { name: CartaoExcluido.name, schema: CartaoExcluidoSchema },
    ]),
  ],
  controllers: [CartaoRespostaController],
  providers: [
    CartaoRespostaService,
    TemplateProvisionService,
    OmrHttpService,
    CartaoHistoricoService,
    CartaoCallbackService,
    CartaoReprocessoService,
    CartaoImagemService,
    CartaoVarreduraService,
    CartaoExcluidoRepository,
    CartaoExclusaoService,
  ],
  exports: [CartaoRespostaService],
})
export class CartaoRespostaModule {}
