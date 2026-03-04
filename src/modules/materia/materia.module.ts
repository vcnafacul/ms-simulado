import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { MateriaSchema } from './materia.schema';
import { MateriaService } from './materia.service';
import { MateriaController } from './materia.controller';
import { MateriaRepository } from './materia.repository';
import { MateriaExistValidator } from './validator/materia-exist.validator';
import { MateriaUniqueValidator } from './validator/materia-unique.validator';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Materia', schema: MateriaSchema },
      { name: Frente.name, schema: FrenteSchema },
      { name: Questao.name, schema: QuestaoSchema },
    ]),
  ],
  controllers: [MateriaController],
  providers: [
    MateriaService,
    MateriaRepository,
    MateriaUniqueValidator,
    MateriaExistValidator,
  ],
  exports: [MateriaService, MateriaRepository],
})
export class MateriaModule {}
