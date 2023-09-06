import { Module } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { QuestaoController } from './questao.controller';

@Module({
  providers: [QuestaoService],
  controllers: [QuestaoController]
})
export class QuestaoModule {}
