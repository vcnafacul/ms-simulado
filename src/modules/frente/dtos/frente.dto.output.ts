import { ApiProperty } from '@nestjs/swagger';

export class FrenteDTOOutput {
  @ApiProperty()
  _id: string;
  @ApiProperty()
  nome: string;
}
