import { ApiProperty } from '@nestjs/swagger';

export class RegraDto {
  @ApiProperty()
  materia: number;

  @ApiProperty()
  frente: string | null;

  @ApiProperty()
  quantidade: number;

  @ApiProperty()
  ano: number | null;

  @ApiProperty()
  caderno: string | null;
}
