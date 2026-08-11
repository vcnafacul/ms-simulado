import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DefinirProvaBaseDTOInput {
  @ApiProperty()
  @IsString()
  provaId: string;

  @ApiProperty({ required: false })
  userId?: string;
}
