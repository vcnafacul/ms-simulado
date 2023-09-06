import { Prop } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Frente } from 'src/modules/frente/frente.schema';
import { Materia } from 'src/modules/materia/materia.schema';

export class Regra {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Materia.name,
    required: true,
  })
  materia: mongoose.Types.ObjectId;

  @Prop({ required: true })
  quantidade: number;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Frente.name,
    required: false,
  })
  frente?: mongoose.Types.ObjectId;

  @Prop({ required: false })
  ano?: number;

  @Prop({ required: false })
  caderno?: number;
}
