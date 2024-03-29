import { Module } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { QuestaoController } from './questao.controller';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ProvaRepository } from '../prova/prova.repository';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';
import { ProvaService } from '../prova/prova.service';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { SimuladoService } from '../simulado/simulado.service';
import {
  TipoSimulado,
  TipoSimuladoSchema,
} from '../tipo-simulado/schemas/tipo-simulado.schema';
import { SimuladoRepository } from '../simulado/repository/simulado.repository';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { AuditLogModule } from '../auditLog/auditLog.module';
import { HistoricoModule } from '../historico/historico.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Questao.name, schema: QuestaoSchema },
      { name: Prova.name, schema: ProvaSchema },
      { name: TipoSimulado.name, schema: TipoSimuladoSchema },
      { name: Simulado.name, schema: SimuladoSchema },
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
  ],
  controllers: [QuestaoController],
  exports: [QuestaoService, QuestaoRepository],
})
export class QuestaoModule {}
