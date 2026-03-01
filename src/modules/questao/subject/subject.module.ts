import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Content, ContentSchema } from '../../content/content.schema';
import { FrenteModule } from '../../frente/frente.module';
import { SubjectController } from './subject.controller';
import { SubjectRepository } from './subject.repository';
import { Subject, SubjectSchema } from './subject.schema';
import { SubjectService } from './subject.service';
import { SubjectExistValidator } from './validator/subject-exist.validator';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subject.name, schema: SubjectSchema },
      { name: Content.name, schema: ContentSchema },
    ]),
    forwardRef(() => FrenteModule),
  ],
  controllers: [SubjectController],
  providers: [SubjectService, SubjectRepository, SubjectExistValidator],
  exports: [SubjectService, SubjectRepository, MongooseModule],
})
export class SubjectModule {}
