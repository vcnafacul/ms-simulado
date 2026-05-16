import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class ListAggregatesDtoInput {
  @ApiProperty()
  @IsString()
  groupId: string;

  @ApiProperty({ enum: ['class'] })
  @IsIn(['class'])
  groupType: 'class';
}
