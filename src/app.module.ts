import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AdjustmentProposalModule } from './modules/adjustment-proposal/adjustment-proposal.module';
import { UserGroupAggregateModule } from './modules/user-group-aggregates/user-group-aggregate.module';
import { ContentModule } from './modules/content/content.module';
import { ContentFileHistoryModule } from './modules/content-file-history/content-file-history.module';
import { ExameModule } from './modules/exame/exame.module';
import { FileContentModule } from './modules/file-content/file-content.module';
import { FrenteModule } from './modules/frente/frente.module';
import { HistoricoModule } from './modules/historico/historico.module';
import { MateriaModule } from './modules/materia/materia.module';
import { ProvaModule } from './modules/prova/prova.module';
import { QuestaoModule } from './modules/questao/questao.module';
import { SimuladoModule } from './modules/simulado/simulado.module';
import { SubjectModule } from './modules/questao/subject/subject.module';
import { CategoriaModule } from './modules/categoria/categoria.module';
import { CartaoRespostaModule } from './modules/cartao-resposta/cartao-resposta.module';
import { CadernoModule } from './modules/caderno/caderno.module';
import { EnvModule } from './shared/modules/env/env.module';
import { Env, envSchema } from './shared/modules/env/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV !== 'test' ? '.env' : undefined,
      validate: (env) => envSchema.parse(env),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB'),
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    EnvModule,
    ExameModule,
    FrenteModule,
    MateriaModule,
    QuestaoModule,
    CategoriaModule,
    SimuladoModule,
    ProvaModule,
    HistoricoModule,
    SubjectModule,
    ContentModule,
    ContentFileHistoryModule,
    FileContentModule,
    AdjustmentProposalModule,
    UserGroupAggregateModule,
    CartaoRespostaModule,
    CadernoModule,
  ],
  providers: [],
})
export class AppModule {}
