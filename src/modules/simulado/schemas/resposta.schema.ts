import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';

export class Resposta {
  @Prop()
  @ApiProperty()
  questao: string;

  @Prop()
  @ApiProperty({ enum: Alternativa })
  alternativaEstudante: Alternativa;

  @Prop()
  @ApiProperty({ enum: Alternativa })
  alternativaCorreta: Alternativa;
}
