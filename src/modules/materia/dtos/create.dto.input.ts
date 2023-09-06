import { ApiProperty } from '@nestjs/swagger';

export class CreateMateriaDTOInput {
  @ApiProperty()
  nome: string;
}
