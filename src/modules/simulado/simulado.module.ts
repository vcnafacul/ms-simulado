import { Module } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { SimuladoController } from './simulado.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulado, SimuladoSchema } from './schemas/simulado.schema';
import { SimuladoRepository } from './repository/simulado.repository';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { QuestaoService } from '../questao/questao.service';
import {
  TipoSimulado,
  TipoSimuladoSchema,
} from '../tipo-simulado/schemas/tipo-simulado.schema';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { TipoSimuladoExistValidator } from '../tipo-simulado/validator/tipo-simulado-exist.validator';
import { RespostaRepository } from './repository/resposta.repository';
import {
  RespostaSimulado,
  RespostaSimuladoSchema,
} from './schemas/resposta-simulado.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Simulado.name, schema: SimuladoSchema },
      { name: TipoSimulado.name, schema: TipoSimuladoSchema },
      { name: Questao.name, schema: QuestaoSchema },
      { name: RespostaSimulado.name, schema: RespostaSimuladoSchema },
    ]),
  ],
  controllers: [SimuladoController],
  providers: [
    SimuladoService,
    SimuladoRepository,
    TipoSimuladoRepository,
    QuestaoService,
    QuestaoRepository,
    TipoSimuladoExistValidator,
    RespostaRepository,
  ],
})
export class SimuladoModule {}
