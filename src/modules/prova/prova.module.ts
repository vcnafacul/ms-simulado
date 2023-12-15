import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaController } from './prova.controller';
import { ProvaService } from './prova.service';
import { ProvaRepository } from './prova.repository';
import { ProvaExistValidator } from './validator/prova-exist.validator';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { ExameRepository } from '../exame/exame.repository';
import { Exame, ExameSchema } from '../exame/exame.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prova.name, schema: ProvaSchema },
      { name: Questao.name, schema: QuestaoSchema },
      { name: Exame.name, schema: ExameSchema },
    ]),
  ],
  controllers: [ProvaController],
  providers: [
    ProvaService,
    ProvaRepository,
    ProvaExistValidator,
    ExameRepository,
  ],
  exports: [ProvaService, ProvaRepository],
})
export class ProvaModule {}
