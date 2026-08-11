import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class AdicionarEmProvaDTOInput {
  @ApiProperty()
  @IsString()
  provaId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  numero: number;

  @ApiProperty({ required: false })
  userId?: string;
}
