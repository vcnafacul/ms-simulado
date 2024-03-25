import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { GetAllInput } from '../base/interfaces/get-all.input';

export class GetAllDtoInput implements GetAllInput {
  @ApiProperty({ default: 1 })
  @IsOptional()
  page: number = 1;

  @ApiProperty({ default: 30 })
  @IsOptional()
  limit: number = 30;
}
