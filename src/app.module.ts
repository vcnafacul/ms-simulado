import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameModule } from './modules/exame/exame.module';
import { FrenteModule } from './modules/frente/frente.module';
import { MateriaModule } from './modules/materia/materia.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB),
    ExameModule,
    FrenteModule,
    MateriaModule,
  ],
  providers: [],
})
export class AppModule {}
