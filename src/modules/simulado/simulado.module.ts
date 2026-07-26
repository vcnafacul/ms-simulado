import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QueueModule } from 'src/shared/modules/queue/queue.module';
import { ExameModule } from '../exame/exame.module';
import { FrenteModule } from '../frente/frente.module';
import { HistoricoModule } from '../historico/historico.module';
import { MateriaModule } from '../materia/materia.module';
import { ProvaRepository } from '../prova/prova.repository';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { QuestaoModule } from '../questao/questao.module';
import { CategoriaModule } from '../categoria/categoria.module';
import { Simulado, SimuladoSchema } from './schemas/simulado.schema';
import { AnswerProcessorService } from './answer-processor.service';
import { SimuladoController } from './simulado.controller';
import { SimuladoRepository } from './simulado.repository';
import { SimuladoService } from './simulado.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Simulado.name, schema: SimuladoSchema },
      { name: Prova.name, schema: ProvaSchema },
    ]),
    QueueModule,
    QuestaoModule,
    forwardRef(() => CategoriaModule),
    ExameModule,
    FrenteModule,
    MateriaModule,
    HistoricoModule,
  ],
  controllers: [SimuladoController],
  providers: [SimuladoService, SimuladoRepository, ProvaRepository, AnswerProcessorService],
  exports: [SimuladoService, SimuladoRepository],
})
export class SimuladoModule {}
