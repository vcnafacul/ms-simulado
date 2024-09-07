import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditLogService } from './auditLog.service';

@ApiTags('AuditLog')
@Controller('v1/auditLog')
export class AuditLogController {
  constructor(private service: AuditLogService) {}

  @Get(':id')
  async getByEntityId(@Param('id') id: string) {
    return await this.service.getByEntityId(id);
  }
}
