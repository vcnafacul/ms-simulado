import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FrenteModule } from '../frente/frente.module';
import { SubjectController } from './subject.controller';
import { SubjectRepository } from './subject.repository';
import { SubjectSchema } from './subject.schema';
import { SubjectService } from './subject.service';
import { SubjectUniqueInFrenteValidator } from './validator/subject-unique-in-frente.validator';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Subject', schema: SubjectSchema }]),
    FrenteModule,
  ],
  controllers: [SubjectController],
  providers: [
    SubjectService,
    SubjectRepository,
    SubjectUniqueInFrenteValidator,
  ],
  exports: [SubjectService, SubjectRepository],
})
export class SubjectModule {}
