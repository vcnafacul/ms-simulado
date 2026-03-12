import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { AuditLogService } from '../auditLog/auditLog.service';
import { ContentRepository } from './content.repository';
import { Content } from './content.schema';
import { CreateContentDTOInput } from './dtos/create-content.dto.input';
import { GetAllContentDtoInput } from './dtos/get-all-content.dto.input';
import { StatusContent } from './enums/status-content.enum';
import { SnapshotContentStatusRepository } from './snapshot/snapshot-content-status.repository';
import { SnapshotContentStatus } from './snapshot/snapshot-content-status.schema';

@Injectable()
export class ContentService {
  constructor(
    private readonly repository: ContentRepository,
    private readonly snapshotRepository: SnapshotContentStatusRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(data: CreateContentDTOInput): Promise<Content> {
    const isUnique = await this.repository.isUnique(data.subject, data.title);
    if (!isUnique) {
      throw new HttpException(
        `Já existe um conteúdo "${data.title}" nesse tema.`,
        HttpStatus.CONFLICT,
      );
    }

    const order = await this.repository.getNextOrder(data.subject);
    const content = Object.assign(new Content(), { ...data, order });
    const created = await this.repository.create(content);
    return await this.repository.getByIdPopulated(created._id);
  }

  async getById(id: string): Promise<Content> {
    return await this.repository.getById(id);
  }

  async getByIdPopulated(id: string): Promise<Content> {
    return await this.repository.getByIdPopulated(id);
  }

  async getAll(param: GetAllContentDtoInput): Promise<GetAllOutput<Content>> {
    return await this.repository.findAllByFilter(param);
  }

  async getBySubject(subjectId: string): Promise<Content[]> {
    return await this.repository.getBySubject(subjectId);
  }

  async getDemands(
    page: number,
    limit: number,
  ): Promise<GetAllOutput<Content>> {
    return await this.repository.findAllByFilter({
      page,
      limit,
      status: StatusContent.Pending_Upload,
    });
  }

  async changeStatus(
    id: string,
    status: StatusContent,
    userId?: string,
    message?: string,
  ): Promise<void> {
    const content = await this.repository.getById(id);
    if (!content) {
      throw new HttpException(
        `Conteúdo não encontrado com ID ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }
    content.status = status;
    await this.repository.update(content);

    if (userId) {
      await this.auditLogService.create({
        user: userId,
        entityId: id,
        entityType: 'Content',
        changes: JSON.stringify({
          message: message || `Status alterado para ${status}`,
        }),
      });
    }
  }

  async reset(id: string, userId?: string): Promise<void> {
    await this.changeStatus(
      id,
      StatusContent.Pending_Upload,
      userId,
      'reset demand',
    );
  }

  async reorder(orderedIds: string[]): Promise<void> {
    const items = orderedIds.map((id, index) => ({ id, order: index }));
    await this.repository.bulkUpdateOrder(items);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async getSummary() {
    const contentSumission = await this.repository.countTotal();
    const contentPending = await this.repository.countByStatus(
      StatusContent.Pending,
    );
    const contentApproved = await this.repository.countByStatus(
      StatusContent.Approved,
    );
    const contentRejected = await this.repository.countByStatus(
      StatusContent.Rejected,
    );

    return {
      contentSumission,
      contentPending,
      contentApproved,
      contentRejected,
    };
  }

  async getStatsByFrente() {
    return await this.repository.getStatsByFrente();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async saveSnapshotContentStatus() {
    const snapshot = await this.repository.getSnapshotData();
    const snapshotEntity = Object.assign(new SnapshotContentStatus(), {
      snapshot_date: snapshot.data,
      pendentes: snapshot.pendentes,
      aprovados: snapshot.aprovados,
      reprovados: snapshot.reprovados,
      pendentes_upload: snapshot.pendentes_upload,
      total: snapshot.total,
    });
    await this.snapshotRepository.create(snapshotEntity);
  }

  async getSnapshotContentStatus(): Promise<SnapshotContentStatus[]> {
    return await this.snapshotRepository.getAllSnapshots();
  }
}
