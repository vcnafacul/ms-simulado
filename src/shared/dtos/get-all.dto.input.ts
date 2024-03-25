import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';
import { GetAllInput } from '../base/interfaces/get-all.input';

export class GetAllDtoInput implements GetAllInput {
  @ApiProperty({ default: 1 })
  @IsNumber()
  page: number = 1;

  @ApiProperty({ default: 30 })
  @IsNumber()
  limit: number = 30;
}
