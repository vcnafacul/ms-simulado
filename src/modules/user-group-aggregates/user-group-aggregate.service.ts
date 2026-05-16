import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserGroupAggregateRepository } from './user-group-aggregate.repository';
import { CalculateAggregateDtoInput } from './dtos/calculate-aggregate.dto.input';

@Injectable()
export class UserGroupAggregateService {
  constructor(private readonly repository: UserGroupAggregateRepository) {}

  list(groupId: string, groupType: 'class') {
    return this.repository.listByGroup(groupId, groupType);
  }

  async findByMonth(groupId: string, groupType: 'class', month: string) {
    const doc = await this.repository.findOneByMonth(groupId, groupType, month);
    if (!doc) throw new NotFoundException('Snapshot not generated for this month');
    return doc;
  }

  async calculate(input: CalculateAggregateDtoInput) {
    const monthStart = new Date(input.monthStart);
    const monthEnd = new Date(input.monthEnd);

    if (monthStart > monthEnd) {
      throw new BadRequestException('monthStart must be before monthEnd');
    }

    const aggregated = await this.repository.aggregateMonth({
      userIds: input.userIds,
      monthStart,
      monthEnd,
    });

    return this.repository.upsert({
      groupId: input.groupId,
      groupType: input.groupType,
      month: input.month,
      monthStart,
      monthEnd,
      userIds: input.userIds,
      payload: aggregated.payload as any,
      generatedAt: new Date(),
      sourceHistoricoCount: aggregated.payload.totalAttempts,
    });
  }
}
