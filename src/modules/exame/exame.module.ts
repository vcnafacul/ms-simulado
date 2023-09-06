import { Module } from '@nestjs/common';
import { ExameController } from './exame.controller';
import { ExameService } from './exame.service';
import { ExameRepository } from './exame.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameSchema } from './exame.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Exame', schema: ExameSchema }]),
  ],
  controllers: [ExameController],
  providers: [ExameService, ExameRepository],
})
export class ExameModule {}
