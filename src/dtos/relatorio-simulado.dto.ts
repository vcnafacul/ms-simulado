import { ApiProperty } from '@nestjs/swagger';
import { RespostaRelatorio } from 'src/models/resposta-relatorio.model';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';

export class RelatorioSimuladoDto {
  @ApiProperty()
  estudante: number;

  @ApiProperty()
  simulado: Simulado;

  @ApiProperty()
  respostas: RespostaRelatorio[];

  @ApiProperty()
  aproveitamento: number;
}
