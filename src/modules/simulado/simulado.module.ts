import { Module } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { SimuladoController } from './simulado.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Simulado, SimuladoSchema } from './simulado.schema';
import { SimuladoRepository } from './simulado.repository';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { QuestaoService } from '../questao/questao.service';
import {
  TipoSimulado,
  TipoSimuladoSchema,
} from '../tipo-simulado/schemas/tipo-simulado.schema';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { TipoSimuladoExistValidator } from '../tipo-simulado/validator/tipo-simulado-exist.validator';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Simulado.name, schema: SimuladoSchema },
      { name: TipoSimulado.name, schema: TipoSimuladoSchema },
      { name: Questao.name, schema: QuestaoSchema },
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
  ],
})
export class SimuladoModule {}
