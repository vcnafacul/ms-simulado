import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentModule } from '../content/content.module';
import { ContentFileHistoryModule } from '../content-file-history/content-file-history.module';
import { FileContentController } from './file-content.controller';
import { FileContentRepository } from './file-content.repository';
import { FileContent, FileContentSchema } from './file-content.schema';
import { FileContentService } from './file-content.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FileContent.name, schema: FileContentSchema },
    ]),
    ContentModule,
    ContentFileHistoryModule,
  ],
  controllers: [FileContentController],
  providers: [FileContentService, FileContentRepository],
  exports: [FileContentService, FileContentRepository],
})
export class FileContentModule {}
