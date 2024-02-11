import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Historico, HistoricoSchema } from './historico.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Historico.name, schema: HistoricoSchema },
    ]),
  ],
})
export class HistoricoModule {}
