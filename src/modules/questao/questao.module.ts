import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../auditLog/auditLog.module';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
import { FrenteRepository } from '../frente/frente.repository';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { HistoricoModule } from '../historico/historico.module';
import { MateriaModule } from '../materia/materia.module';
import { ProvaFactory } from '../prova/factory/prova_factory';
import { ProvaRepository } from '../prova/prova.repository';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { ProvaService } from '../prova/prova.service';
import { EnemService } from '../prova/services/enem_service';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { SimuladoService } from '../simulado/simulado.service';
import {
  TipoSimulado,
  TipoSimuladoSchema,
} from '../tipo-simulado/schemas/tipo-simulado.schema';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { QuestaoController } from './questao.controller';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';
import { QuestaoService } from './questao.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Questao.name, schema: QuestaoSchema },
      { name: Prova.name, schema: ProvaSchema },
      { name: TipoSimulado.name, schema: TipoSimuladoSchema },
      { name: Simulado.name, schema: SimuladoSchema },
      { name: Frente.name, schema: FrenteSchema },
    ]),
    QuestaoModule,
    ExameModule,
    FrenteModule,
    MateriaModule,
    AuditLogModule,
    HistoricoModule,
  ],
  providers: [
    QuestaoService,
    QuestaoRepository,
    ProvaRepository,
    ProvaService,
    TipoSimuladoRepository,
    SimuladoService,
    SimuladoRepository,
    ProvaFactory,
    EnemService,
    FrenteRepository,
    SimuladoService,
  ],
  controllers: [QuestaoController],
  exports: [QuestaoService, QuestaoRepository],
})
export class QuestaoModule {}
