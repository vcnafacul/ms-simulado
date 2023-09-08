import { ApiProperty } from '@nestjs/swagger';
import { QuestaoAnswerDTOOutput } from 'src/modules/questao/dtos/questao-answer.dto.output';

export class SimuladoAnswerDTOOutput {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  tipo: string;

  @ApiProperty({ type: QuestaoAnswerDTOOutput, isArray: true })
  questoes: QuestaoAnswerDTOOutput[];

  @ApiProperty()
  nome: string;

  @ApiProperty()
  descricao: string;

  @ApiProperty()
  duracao: number;

  @ApiProperty()
  inicio: Date;
}
