import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';
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
  controllers: [RelatorioSimuladoEstudanteController],
  providers: [
    RelatorioSimuladoEstudanteRepository,
    RelatorioSimuladoEstudanteService,
  ],
  exports: [RelatorioSimuladoEstudanteRepository],
})
export class RelatorioSimuladoEstudanteModule {}
