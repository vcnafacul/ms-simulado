import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';
import { QuestaoModule } from '../questao/questao.module';
import { SimuladoModule } from '../simulado/simulado.module';
import {
  TipoSimulado,
  TipoSimuladoSchema,
} from '../tipo-simulado/schemas/tipo-simulado.schema';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaController } from './prova.controller';
import { ProvaRepository } from './prova.repository';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaService } from './prova.service';
import { ProvaExistValidator } from './validator/prova-exist.validator';

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
    ProvaFactory,
  ],
  exports: [ProvaService, ProvaRepository],
})
export class ProvaModule {}
