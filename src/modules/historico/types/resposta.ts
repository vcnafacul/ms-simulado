import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';
import { Questao } from 'src/modules/questao/questao.schema';

export class Resposta {
  @ApiProperty()
  @Prop({ ref: Questao.name, type: Types.ObjectId })
  public questao: Questao;

  @Prop()
  @ApiProperty({ enum: Alternativa })
  alternativaEstudante: Alternativa;

  @Prop()
  @ApiProperty({ enum: Alternativa })
  alternativaCorreta: Alternativa;
}
