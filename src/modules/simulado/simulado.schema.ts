import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Questao } from '../questao/questao.schema';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Types } from 'mongoose';

@Schema()
export class Simulado extends BaseSchema {
  @Prop()
  nome: string;

  @Prop()
  descricao: string;

  @Prop({ ref: TipoSimulado.name, type: Types.ObjectId })
  tipo: TipoSimulado;

  @Prop({ ref: Questao.name, type: Types.Array })
  questoes: Questao[];

  @Prop({ required: false, default: 0 })
  aproveitamento?: number;

  @Prop({ required: false, default: 0 })
  vezesRespondido?: number;

  @Prop({ required: false, default: false })
  bloqueado?: boolean;
}

export const SimuladoSchema = SchemaFactory.createForClass(Simulado);
