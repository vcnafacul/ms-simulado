import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestaoModule } from '../questao/questao.module';
import { SimuladoModule } from '../simulado/simulado.module';
import { HistoricoModule } from '../historico/historico.module';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { EnvModule } from 'src/shared/modules/env/env.module';
import { AvisoDoRecalculoService } from './recalculo/aviso-do-recalculo.service';
import { DivergenciaRepository } from './recalculo/divergencia.repository';
import { RecalculoAnulacaoConsumer } from './recalculo/recalculo-anulacao.consumer';
import { RecalculoAnulacaoController } from './recalculo/recalculo-anulacao.controller';
import {
  RecalculoAnulacao,
  RecalculoAnulacaoSchema,
} from './recalculo/recalculo-anulacao.schema';
import { RecalculoAnulacaoService } from './recalculo/recalculo-anulacao.service';
import { RelatorioProvaController } from './relatorio-prova.controller';
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
      // tickets/042, card 12.
      { name: RecalculoAnulacao.name, schema: RecalculoAnulacaoSchema },
      { name: Simulado.name, schema: SimuladoSchema },
    ]),
    SimuladoModule,
    HistoricoModule,
    EnvModule,
    /*
      ⚠️ Só pelo `QuestaoRepository.contadoresGlobais` (card 16) — o acerto da
      base inteira, que o agregado do recorte não tem como saber.
    */
    QuestaoModule,
  ],
  controllers: [
    RelatorioSimuladoEstudanteController,
    RelatorioProvaController,
    RecalculoAnulacaoController,
  ],
  providers: [
    RelatorioSimuladoEstudanteRepository,
    RelatorioSimuladoEstudanteService,
    DivergenciaRepository,
    RecalculoAnulacaoService,
    AvisoDoRecalculoService,
    RecalculoAnulacaoConsumer,
  ],
  exports: [RelatorioSimuladoEstudanteRepository, RecalculoAnulacaoService],
})
export class RelatorioSimuladoEstudanteModule {}
