import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SwapOrderDTOInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id1: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id2: string;
}
