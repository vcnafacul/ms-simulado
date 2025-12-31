import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubjectModule } from '../subject/subject.module';
import { ContentController } from './content.controller';
import { ContentRepository } from './content.repository';
import { ContentSchema } from './content.schema';
import { ContentService } from './content.service';
import { FileContentRepository } from './file-content/file-content.repository';
import { FileContentSchema } from './file-content/file-content.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Content', schema: ContentSchema },
      { name: 'FileContent', schema: FileContentSchema },
    ]),
    SubjectModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, ContentRepository, FileContentRepository],
  exports: [ContentService, ContentRepository, FileContentRepository],
})
export class ContentModule {}
