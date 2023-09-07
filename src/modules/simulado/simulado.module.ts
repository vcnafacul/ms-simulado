import { Module } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { SimuladoController } from './simulado.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { SimuladoSchema } from './simulado.schema';
import { SimuladoRepository } from './simulado.repository';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { QuestaoService } from '../questao/questao.service';
import { TipoSimuladoSchema } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { QuestaoRepository } from '../questao/questao.repository';
import { QuestaoSchema } from '../questao/questao.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Simulado', schema: SimuladoSchema },
      { name: 'TipoSimulado', schema: TipoSimuladoSchema },
      { name: 'Questao', schema: QuestaoSchema },
    ]),
  ],
  controllers: [SimuladoController],
  providers: [
    SimuladoService,
    SimuladoRepository,
    TipoSimuladoRepository,
    QuestaoService,
    QuestaoRepository,
  ],
})
export class SimuladoModule {}
