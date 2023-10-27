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
import { ExameRepository } from '../exame/exame.repository';
import { MateriaRepository } from '../materia/materia.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { Exame, ExameSchema } from '../exame/exame.schema';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Materia, MateriaSchema } from '../materia/materia.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Simulado.name, schema: SimuladoSchema },
      { name: TipoSimulado.name, schema: TipoSimuladoSchema },
      { name: Questao.name, schema: QuestaoSchema },
      { name: RespostaSimulado.name, schema: RespostaSimuladoSchema },
      { name: Exame.name, schema: ExameSchema },
      { name: Frente.name, schema: FrenteSchema },
      { name: Materia.name, schema: MateriaSchema },
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
    ExameRepository,
    MateriaRepository,
    FrenteRepository,
  ],
})
export class SimuladoModule {}
