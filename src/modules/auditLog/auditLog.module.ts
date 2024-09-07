import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogService } from './auditLog.service';
import { AuditLogSchema } from './auditLog.schema';
import { AuditLogRepository } from './auditLog.repository';
import { AuditLogController } from './auditLog.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'AuditLog', schema: AuditLogSchema }]),
  ],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogRepository],
  exports: [AuditLogService, AuditLogRepository],
})
export class AuditLogModule {}
