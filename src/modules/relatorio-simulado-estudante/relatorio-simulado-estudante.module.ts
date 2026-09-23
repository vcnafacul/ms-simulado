import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestaoModule } from '../questao/questao.module';
import { SimuladoModule } from '../simulado/simulado.module';
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
    SimuladoModule,
    /*
      ⚠️ Só pelo `QuestaoRepository.contadoresGlobais` (card 16) — o acerto da
      base inteira, que o agregado do recorte não tem como saber.
    */
    QuestaoModule,
  ],
  controllers: [RelatorioSimuladoEstudanteController],
  providers: [
    RelatorioSimuladoEstudanteRepository,
    RelatorioSimuladoEstudanteService,
  ],
  exports: [RelatorioSimuladoEstudanteRepository],
})
export class RelatorioSimuladoEstudanteModule {}
