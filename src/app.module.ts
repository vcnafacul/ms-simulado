import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameModule } from './modules/exame/exame.module';
import { FrenteModule } from './modules/frente/frente.module';
import { HistoricoModule } from './modules/historico/historico.module';
import { MateriaModule } from './modules/materia/materia.module';
import { ProvaModule } from './modules/prova/prova.module';
import { QuestaoModule } from './modules/questao/questao.module';
import { SimuladoModule } from './modules/simulado/simulado.module';
import { TipoSimuladoModule } from './modules/tipo-simulado/tipo-simulado.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV !== 'test' ? '.env' : undefined,
    }),
    MongooseModule.forRoot(process.env.MONGODB, {
      serverSelectionTimeoutMS: 5000,
    }),
    ExameModule,
    FrenteModule,
    MateriaModule,
    QuestaoModule,
    TipoSimuladoModule,
    SimuladoModule,
    ProvaModule,
    HistoricoModule,
  ],
  providers: [],
})
export class AppModule {}
