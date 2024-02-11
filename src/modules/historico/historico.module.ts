import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Historico, HistoricoSchema } from './historico.schema';
import { HistoricoRepository } from './historico.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Historico.name, schema: HistoricoSchema },
    ]),
  ],
  providers: [HistoricoRepository],
  exports: [HistoricoRepository],
})
export class HistoricoModule {}
