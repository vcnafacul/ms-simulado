import { Module } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { QuestaoController } from './questao.controller';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameExistValidator } from '../exame/validator/exame-exist.validator';
import { FrenteExistValidator } from '../frente/validator/frente-exist.validator';
import { MateriaExistValidator } from '../materia/validator/materia-exist.validator';
import { ExameRepository } from '../exame/exame.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { MateriaRepository } from '../materia/materia.repository';
import { Exame, ExameSchema } from '../exame/exame.schema';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Materia, MateriaSchema } from '../materia/materia.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { Prova, ProvaSchema } from '../prova/prova.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Exame.name, schema: ExameSchema },
      { name: Frente.name, schema: FrenteSchema },
      { name: Materia.name, schema: MateriaSchema },
      { name: Questao.name, schema: QuestaoSchema },
      { name: Prova.name, schema: ProvaSchema },
    ]),
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
    ProvaRepository,
  ],
  controllers: [QuestaoController],
  exports: [QuestaoService, QuestaoRepository],
})
export class QuestaoModule {}
