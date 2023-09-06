import { ApiProperty } from '@nestjs/swagger';

export class MateriaDTOOutput {
  @ApiProperty()
  _id: string;
  @ApiProperty()
  nome: string;
}
