import { ApiProperty } from '@nestjs/swagger';

export class ExameDto {
  @ApiProperty()
  nome: string;

  @ApiProperty()
  localizacao: string;
}
