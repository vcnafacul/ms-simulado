import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

export class GetByMonthDtoInput {
  @ApiProperty()
  @IsString()
  groupId: string;

  @ApiProperty({ enum: ['class'] })
  @IsIn(['class'])
  groupType: 'class';

  @ApiProperty({ example: '2026-05' })
  @Matches(/^\d{4}-\d{2}$/)
  month: string;
}
