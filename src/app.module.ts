import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
    MongooseModule.forRootAsync({
      useFactory: async () => {
        if (process.env.NODE_ENV === 'test') {
          const mongod = await MongoMemoryServer.create();
          const uri = mongod.getUri();
          return {
            uri,
          };
        }
        return {
          uri: process.env.MONGODB,
        };
      },
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
