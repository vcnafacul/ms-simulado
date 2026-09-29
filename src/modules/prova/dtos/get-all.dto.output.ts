import { ApiProperty } from '@nestjs/swagger';
import { Edicao } from '../enums/edicao.enum';

export class GetProvaDTOOutout {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  edicao: Edicao;

  @ApiProperty()
  aplicacao: number;

  @ApiProperty()
  ano: number;

  @ApiProperty()
  categoria: string;

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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  receberNovasVersoes: boolean;

  /** tickets/027: de qual prova esta foi duplicada. */
  @ApiProperty({ required: false, nullable: true })
  provaOrigemId?: string | null;
}
