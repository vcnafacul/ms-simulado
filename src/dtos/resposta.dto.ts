import { ApiProperty } from '@nestjs/swagger';

export class RespostaDto {
  @ApiProperty()
  idQuestao: string;

  @ApiProperty()
  alternativaEstudante: string;
}
