import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';
import { QuestaoModule } from '../questao/questao.module';
import { SimuladoModule } from '../simulado/simulado.module';
import {
  Categoria,
  CategoriaSchema,
} from '../categoria/schemas/categoria.schema';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaController } from './prova.controller';
import { ProvaRepository } from './prova.repository';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaService } from './prova.service';
import { ProvaExistValidator } from './validator/prova-exist.validator';
import { EnemService } from './services/enem_service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prova.name, schema: ProvaSchema },
      { name: Categoria.name, schema: CategoriaSchema },
    ]),
    ExameModule,
    QuestaoModule,
    MateriaModule,
    FrenteModule,
    forwardRef(() => SimuladoModule),
  ],
  controllers: [ProvaController],
  providers: [
    ProvaService,
    ProvaRepository,
    ProvaExistValidator,
    CategoriaRepository,
    ProvaFactory,
    EnemService,
  ],
  exports: [ProvaService, ProvaRepository],
})
export class ProvaModule {}
