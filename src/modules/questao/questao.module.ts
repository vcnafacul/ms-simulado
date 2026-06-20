import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../auditLog/auditLog.module';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
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
  Categoria,
  CategoriaSchema,
} from '../categoria/schemas/categoria.schema';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { QuestaoController } from './questao.controller';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';
import { QuestaoService } from './questao.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Questao.name, schema: QuestaoSchema },
      { name: Prova.name, schema: ProvaSchema },
      { name: Categoria.name, schema: CategoriaSchema },
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
    CategoriaRepository,
    SimuladoService,
    SimuladoRepository,
    ProvaFactory,
    EnemService,
    SimuladoService,
  ],
  controllers: [QuestaoController],
  exports: [QuestaoService, QuestaoRepository],
})
export class QuestaoModule {}
