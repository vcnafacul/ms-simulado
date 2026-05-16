import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserGroupAggregateService } from './user-group-aggregate.service';
import { CalculateAggregateDtoInput } from './dtos/calculate-aggregate.dto.input';
import { GetByMonthDtoInput } from './dtos/get-by-month.dto.input';
import { ListAggregatesDtoInput } from './dtos/list-aggregates.dto.input';
import { UserGroupAggregateDtoOutput } from './dtos/user-group-aggregate.dto.output';

@ApiTags('UserGroupAggregates')
@Controller('v1/user-group-aggregates')
export class UserGroupAggregateController {
  constructor(private readonly service: UserGroupAggregateService) {}

  @Get()
  @ApiResponse({ status: 200, type: [UserGroupAggregateDtoOutput] })
  async list(@Query() q: ListAggregatesDtoInput) {
    return this.service.list(q.groupId, q.groupType);
  }

  @Get('by-month')
  @ApiResponse({ status: 200, type: UserGroupAggregateDtoOutput })
  @ApiResponse({ status: 404, description: 'Aggregate not found for this month' })
  async byMonth(@Query() q: GetByMonthDtoInput) {
    return this.service.findByMonth(q.groupId, q.groupType, q.month);
  }

  @Post('calculate')
  @ApiResponse({ status: 201, type: UserGroupAggregateDtoOutput })
  async calculate(@Body() dto: CalculateAggregateDtoInput) {
    return this.service.calculate(dto);
  }
}
