import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Questao } from '../../questao/questao.schema';

@Schema({ _id: true, versionKey: false })
export class QuestaoNaContainer {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Questao', required: true })
  questao: Questao;

  @Prop({ required: false, type: Number, default: null })
  numero: number | null;
}

export const QuestaoNaContainerSchema =
  SchemaFactory.createForClass(QuestaoNaContainer);
