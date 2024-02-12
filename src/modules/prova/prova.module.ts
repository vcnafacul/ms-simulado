import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaController } from './prova.controller';
import { ProvaService } from './prova.service';
import { ProvaRepository } from './prova.repository';
import { ProvaExistValidator } from './validator/prova-exist.validator';
import { MateriaModule } from '../materia/materia.module';
import { FrenteModule } from '../frente/frente.module';
import { QuestaoModule } from '../questao/questao.module';
import { SimuladoModule } from '../simulado/simulado.module';
import { ExameModule } from '../exame/exame.module';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import {
  TipoSimulado,
  TipoSimuladoSchema,
} from '../tipo-simulado/schemas/tipo-simulado.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prova.name, schema: ProvaSchema },
      { name: TipoSimulado.name, schema: TipoSimuladoSchema },
    ]),
    ExameModule,
    QuestaoModule,
    MateriaModule,
    FrenteModule,
    SimuladoModule,
  ],
  controllers: [ProvaController],
  providers: [
    ProvaService,
    ProvaRepository,
    ProvaExistValidator,
    TipoSimuladoRepository,
  ],
  exports: [ProvaService, ProvaRepository],
})
export class ProvaModule {}
