import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: RelatorioSimuladoEstudante.name,
        schema: RelatorioSimuladoEstudanteSchema,
      },
    ]),
  ],
  providers: [RelatorioSimuladoEstudanteRepository],
  exports: [RelatorioSimuladoEstudanteRepository],
})
export class RelatorioSimuladoEstudanteModule {}
