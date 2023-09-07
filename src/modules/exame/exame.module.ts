import { Module } from '@nestjs/common';
import { ExameController } from './exame.controller';
import { ExameService } from './exame.service';
import { ExameRepository } from './exame.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { ExameSchema } from './exame.schema';
import { ExameUniqueValidator } from './validator/exame-unique.validator';
import { ExameExistValidator } from './validator/exame-exist.validator';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Exame', schema: ExameSchema }]),
  ],
  controllers: [ExameController],
  providers: [
    ExameService,
    ExameRepository,
    ExameUniqueValidator,
    ExameExistValidator,
  ],
  exports: [ExameService, ExameRepository],
})
export class ExameModule {}
