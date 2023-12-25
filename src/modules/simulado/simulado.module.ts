import { Module } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { SimuladoController } from './simulado.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulado, SimuladoSchema } from './schemas/simulado.schema';
import { SimuladoRepository } from './repository/simulado.repository';
import { RespostaRepository } from './repository/resposta.repository';
import {
  RespostaSimulado,
  RespostaSimuladoSchema,
} from './schemas/resposta-simulado.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { QuestaoModule } from '../questao/questao.module';
import { TipoSimuladoModule } from '../tipo-simulado/tipo-simulado.module';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Simulado.name, schema: SimuladoSchema },
      { name: RespostaSimulado.name, schema: RespostaSimuladoSchema },
      { name: Prova.name, schema: ProvaSchema },
    ]),
    QuestaoModule,
    TipoSimuladoModule,
    ExameModule,
    FrenteModule,
    MateriaModule,
  ],
  controllers: [SimuladoController],
  providers: [
    SimuladoService,
    SimuladoRepository,
    RespostaRepository,
    ProvaRepository,
  ],
  exports: [SimuladoService, SimuladoRepository],
})
export class SimuladoModule {}
