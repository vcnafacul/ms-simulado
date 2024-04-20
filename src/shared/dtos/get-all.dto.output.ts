import { ApiProperty } from '@nestjs/swagger';
import { GetAllOutput } from '../base/interfaces/get-all.output';

export class GetAllDtoOutput<T> implements GetAllOutput<T> {
  @ApiProperty()
  data: T[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalItems: number;
}
