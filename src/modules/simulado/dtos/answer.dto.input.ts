import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';
import { Questao } from 'src/modules/questao/questao.schema';

export class AnswerDTO {
  @ApiProperty()
  @IsString()
  questao: Questao;

  @ApiProperty({ enum: Alternativa })
  @IsEnum(Alternativa)
  alternativaEstudante: Alternativa;
}
