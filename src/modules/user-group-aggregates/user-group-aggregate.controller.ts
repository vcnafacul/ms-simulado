import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserGroupAggregateService } from './user-group-aggregate.service';
import { CalculateAggregateDtoInput } from './dtos/calculate-aggregate.dto.input';
import { GetByMonthDtoInput } from './dtos/get-by-month.dto.input';
import { ListAggregatesDtoInput } from './dtos/list-aggregates.dto.input';

@ApiTags('UserGroupAggregates')
@Controller('v1/user-group-aggregates')
export class UserGroupAggregateController {
  constructor(private readonly service: UserGroupAggregateService) {}

  @Get()
  async list(@Query() q: ListAggregatesDtoInput) {
    return this.service.list(q.groupId, q.groupType);
  }

  @Get('by-month')
  async byMonth(@Query() q: GetByMonthDtoInput) {
    return this.service.findByMonth(q.groupId, q.groupType, q.month);
  }

  @Post('calculate')
  async calculate(@Body() dto: CalculateAggregateDtoInput) {
    return this.service.calculate(dto);
  }
}
