import { ApiProperty } from '@nestjs/swagger';
import { RespostaDto } from 'src/dtos/resposta.dto';

export class RespostaSimuladoDto {
  @ApiProperty()
  Idestudante: number;

  @ApiProperty()
  Idsimulado: string;

  @ApiProperty()
  respostas: RespostaDto[];
}
