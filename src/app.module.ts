import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AllSchemas } from './schemas/_index';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB),
    MongooseModule.forFeature(AllSchemas),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
