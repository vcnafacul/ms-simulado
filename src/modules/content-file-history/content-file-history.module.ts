import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContentFileHistory,
  ContentFileHistorySchema,
} from './content-file-history.schema';
import { ContentFileHistoryController } from './content-file-history.controller';
import { ContentFileHistoryRepository } from './content-file-history.repository';
import { ContentFileHistoryService } from './content-file-history.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentFileHistory.name, schema: ContentFileHistorySchema },
    ]),
  ],
  controllers: [ContentFileHistoryController],
  providers: [ContentFileHistoryService, ContentFileHistoryRepository],
  exports: [ContentFileHistoryService, ContentFileHistoryRepository],
})
export class ContentFileHistoryModule {}
