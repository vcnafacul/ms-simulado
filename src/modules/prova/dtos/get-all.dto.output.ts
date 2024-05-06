import { ApiProperty } from '@nestjs/swagger';
import { Edicao } from '../enums/edicao.enum';

export class GetAllDTOOutput {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  edicao: Edicao;

  @ApiProperty()
  aplicacao: number;

  @ApiProperty()
  ano: number;

  @ApiProperty()
  exame: string;

  @ApiProperty()
  nome: string;

  @ApiProperty()
  totalQuestao: number;

  @ApiProperty()
  totalQuestaoCadastradas: number;

  @ApiProperty()
  totalQuestaoValidadas: number;

  @ApiProperty()
  filename: string;

  @ApiProperty()
  enemAreas: string[];
}
