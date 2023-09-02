import { ApiProperty } from '@nestjs/swagger';
import { RegraDto } from 'src/dtos/regra.dto';

export class TipoSimuladoDto {
  @ApiProperty()
  nome: string;

  @ApiProperty()
  quantidadeTotalQuestao: number;

  @ApiProperty()
  regras: RegraDto[];

  @ApiProperty()
  duracao: number;
}
