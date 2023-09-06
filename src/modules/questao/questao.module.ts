import { Module } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { QuestaoController } from './questao.controller';
import { QuestaoRepository } from './questao.repository';
import { QuestaoSchema } from './questao.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Questao', schema: QuestaoSchema }]),
  ],
  providers: [QuestaoService],
  controllers: [QuestaoController, QuestaoRepository],
})
export class QuestaoModule {}
