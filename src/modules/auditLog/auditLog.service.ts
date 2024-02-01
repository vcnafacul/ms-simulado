import { Injectable } from '@nestjs/common';
import { AuditLog } from './auditLog.schema';
import { AuditLogRepository } from './auditLog.repository';

@Injectable()
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  public async create(auditLog: AuditLog): Promise<AuditLog> {
    return await this.repository.create(auditLog);
  }
}
