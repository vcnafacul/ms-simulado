import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';
import { Questao } from 'src/modules/questao/questao.schema';

export class Resposta {
  @ApiProperty()
  @Prop({ ref: Questao.name, type: Types.ObjectId })
  public questao: Questao;

  /**
   * O número da questão no simulado quando ela foi respondida.
   *
   * ⚠️ Ausente em histórico processado antes deste campo existir — quem lê cai
   * para o número atual no simulado. Não é o mesmo que o atual: uma nova versão
   * (card 26) troca o ponteiro do simulado para a sucessora.
   */
  @Prop({ type: Number, required: false })
  @ApiProperty({ required: false, nullable: true })
  numero?: number | null;

  @Prop()
  @ApiProperty({ enum: Alternativa })
  alternativaEstudante: Alternativa;

  @Prop()
  @ApiProperty({ enum: Alternativa })
  alternativaCorreta: Alternativa;
}
