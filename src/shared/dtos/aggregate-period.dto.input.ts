import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Period } from '../enum/period';

export class AggregatePeriodDtoInput {
  @ApiProperty()
  @IsEnum(Period)
  groupBy: Period;
}
