import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Frente } from 'src/modules/frente/frente.schema';
import { Materia } from 'src/modules/materia/materia.schema';

export class Regra {
  @Prop({
    type: Types.ObjectId,
    ref: Materia.name,
    required: true,
  })
  materia: Types.ObjectId;

  @Prop({ required: true })
  quantidade: number;

  @Prop({
    type: Types.ObjectId,
    ref: Frente.name,
    required: false,
  })
  frente?: Types.ObjectId;

  @Prop({ required: false })
  ano?: number;

  @Prop({ required: false })
  caderno?: number;
}
