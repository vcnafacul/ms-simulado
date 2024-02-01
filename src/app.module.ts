import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameModule } from './modules/exame/exame.module';
import { FrenteModule } from './modules/frente/frente.module';
import { MateriaModule } from './modules/materia/materia.module';
import { QuestaoModule } from './modules/questao/questao.module';
import { TipoSimuladoModule } from './modules/tipo-simulado/tipo-simulado.module';
import { SimuladoModule } from './modules/simulado/simulado.module';
import { ProvaModule } from './modules/prova/prova.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB),
    ExameModule,
    FrenteModule,
    MateriaModule,
    QuestaoModule,
    TipoSimuladoModule,
    SimuladoModule,
    ProvaModule,
  ],
  providers: [],
})
export class AppModule {}
