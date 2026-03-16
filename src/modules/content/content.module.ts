import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLogModule } from '../auditLog/auditLog.module';
import {
  FileContent,
  FileContentSchema,
} from '../file-content/file-content.schema';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { SubjectModule } from '../questao/subject/subject.module';
import { ContentController } from './content.controller';
import { ContentRepository } from './content.repository';
import { Content, ContentSchema } from './content.schema';
import { ContentService } from './content.service';
import {
  SnapshotContentStatus,
  SnapshotContentStatusSchema,
} from './snapshot/snapshot-content-status.schema';
import { SnapshotContentStatusRepository } from './snapshot/snapshot-content-status.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Content.name, schema: ContentSchema },
      { name: FileContent.name, schema: FileContentSchema },
      { name: Frente.name, schema: FrenteSchema },
      {
        name: SnapshotContentStatus.name,
        schema: SnapshotContentStatusSchema,
      },
    ]),
    ScheduleModule.forRoot(),
    SubjectModule,
    AuditLogModule,
  ],
  controllers: [ContentController],
  providers: [
    ContentService,
    ContentRepository,
    SnapshotContentStatusRepository,
  ],
  exports: [ContentService, ContentRepository, MongooseModule],
})
export class ContentModule {}
