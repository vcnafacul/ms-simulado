import { ApiProperty } from '@nestjs/swagger';
import { RegraDTO } from './regra.dto';

export class CreateTipoSimuladoDTOInput {
  @ApiProperty() // precisa criar um decorator pra validar que o nome é unico
  public nome: string;

  @ApiProperty()
  public duracao: number;

  @ApiProperty()
  public quantidadeTotalQuestao: number;

  @ApiProperty({ type: [RegraDTO], required: false })
  public regras: RegraDTO[];
}
