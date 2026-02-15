import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class ChangeOrderDTOInput {
  @ApiProperty()
  @IsString()
  subjectId: string;

  @ApiProperty()
  @IsNumber()
  newOrder: number;
}
