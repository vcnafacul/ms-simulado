import { ApiProperty } from '@nestjs/swagger';

export class AvailableSimuladoDTOoutput {
  @ApiProperty()
  nome: string;

  @ApiProperty()
  simuladoId: string;
}
