import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { AuditLog } from './auditLog.schema';

@Injectable()
export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor(@InjectModel('AuditLog') model: Model<AuditLog>) {
    super(model);
  }
}
