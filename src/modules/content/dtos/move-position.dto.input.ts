import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class MovePositionDTOInput {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  position: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;
}
