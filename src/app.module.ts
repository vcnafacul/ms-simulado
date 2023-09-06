import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AllSchemas } from './schemas/_index';
import { ExameService } from './modules/exame/exame.service';
import { ExameController } from './modules/exame/exame.controller';
import { ExameModule } from './modules/exame/exame.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB),
    MongooseModule.forFeature(AllSchemas),
    ExameModule,
  ],
  providers: [],
})
export class AppModule {}
