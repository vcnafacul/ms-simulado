import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Historico, HistoricoSchema } from './historico.schema';
import { HistoricoRepository } from './historico.repository';
import { HistoricoController } from './historico.controller';
import { HistoricoService } from './historico.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Historico.name, schema: HistoricoSchema },
    ]),
  ],
  providers: [HistoricoRepository, HistoricoService],
  exports: [HistoricoRepository],
  controllers: [HistoricoController],
})
export class HistoricoModule {}
