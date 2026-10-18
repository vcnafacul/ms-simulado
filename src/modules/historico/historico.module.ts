import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Historico, HistoricoSchema } from './historico.schema';
import { HistoricoRepository } from './historico.repository';
import { HistoricoController } from './historico.controller';
import { HistoricoService } from './historico.service';
import { MonitoramentoHistoricoController } from './monitoramento/monitoramento-historico.controller';
import { MonitoramentoHistoricoService } from './monitoramento/monitoramento-historico.service';
import { SimuladosDoCursinhoRepository } from './monitoramento/simulados-do-cursinho.repository';
import {
  Simulado,
  SimuladoSchema,
} from 'src/modules/simulado/schemas/simulado.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Historico.name, schema: HistoricoSchema },
      { name: Simulado.name, schema: SimuladoSchema },
    ]),
  ],
  providers: [
    HistoricoRepository,
    HistoricoService,
    SimuladosDoCursinhoRepository,
    MonitoramentoHistoricoService,
  ],
  exports: [HistoricoRepository],
  controllers: [HistoricoController, MonitoramentoHistoricoController],
})
export class HistoricoModule {}
