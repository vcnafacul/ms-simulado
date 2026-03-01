import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentModule } from '../content/content.module';
import { MateriaModule } from '../materia/materia.module';
import { QuestaoSchema } from '../questao/questao.schema';
import { SubjectSchema } from '../questao/subject/subject.schema';
import { SubjectModule } from '../questao/subject/subject.module';
import { FrenteController } from './frente.controller';
import { FrenteRepository } from './frente.repository';
import { FrenteSchema } from './frente.schema';
import { FrenteService } from './frente.service';
import { Frente2And3ExistValidator } from './validator/frente-2-and-3-exist.validator';
import { FrenteExistValidator } from './validator/frente-exist.validator';
import { FrenteUniqueValidator } from './validator/frente-unique.validator';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Frente', schema: FrenteSchema },
      { name: 'Subject', schema: SubjectSchema },
      { name: 'Questao', schema: QuestaoSchema },
    ]),
    MateriaModule,
    forwardRef(() => SubjectModule),
    forwardRef(() => ContentModule),
  ],
  controllers: [FrenteController],
  providers: [
    FrenteService,
    FrenteRepository,
    FrenteUniqueValidator,
    FrenteExistValidator,
    Frente2And3ExistValidator,
  ],
  exports: [FrenteService, FrenteRepository],
})
export class FrenteModule {}
