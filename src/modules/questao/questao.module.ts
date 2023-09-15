import { Module } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { QuestaoController } from './questao.controller';
import { QuestaoRepository } from './questao.repository';
import { QuestaoSchema } from './questao.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameExistValidator } from '../exame/validator/exame-exist.validator';
import { FrenteExistValidator } from '../frente/validator/frente-exist.validator';
import { MateriaExistValidator } from '../materia/validator/materia-exist.validator';
import { ExameRepository } from '../exame/exame.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { MateriaRepository } from '../materia/materia.repository';
import { ExameSchema } from '../exame/exame.schema';
import { FrenteSchema } from '../frente/frente.schema';
import { MateriaSchema } from '../materia/materia.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Exame', schema: ExameSchema }]),
    MongooseModule.forFeature([{ name: 'Frente', schema: FrenteSchema }]),
    MongooseModule.forFeature([{ name: 'Materia', schema: MateriaSchema }]),
    MongooseModule.forFeature([{ name: 'Questao', schema: QuestaoSchema }]),
  ],
  providers: [
    QuestaoService,
    QuestaoRepository,
    ExameRepository,
    FrenteRepository,
    MateriaRepository,
    ExameExistValidator,
    FrenteExistValidator,
    MateriaExistValidator,
  ],
  controllers: [QuestaoController],
  exports: [QuestaoService, QuestaoRepository],
})
export class QuestaoModule {}
