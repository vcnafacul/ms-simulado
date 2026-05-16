import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsString,
  ArrayNotEmpty,
  Matches,
} from 'class-validator';

export class CalculateAggregateDtoInput {
  @ApiProperty()
  @IsString()
  groupId: string;

  @ApiProperty({ enum: ['class'] })
  @IsIn(['class'])
  groupType: 'class';

  @ApiProperty({ example: '2026-05' })
  @Matches(/^\d{4}-\d{2}$/)
  month: string;

  @ApiProperty()
  @IsDateString()
  monthStart: string;

  @ApiProperty()
  @IsDateString()
  monthEnd: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  userIds: string[];
}
