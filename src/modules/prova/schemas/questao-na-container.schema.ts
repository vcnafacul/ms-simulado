import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Questao } from '../../questao/questao.schema';

@Schema({ _id: true, versionKey: false })
export class QuestaoNaContainer {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Questao', required: true })
  questao: Questao;

  // Nullable: uma questão pode estar vinculada à prova sem posição definida
  // ainda (o admin remove o número na aba Classificação). Simulado com questão
  // sem número nunca é liberado — ver `todasNumeradas` em simulado/helpers.
  @Prop({ required: false, type: Number, default: null })
  numero: number | null;
}

export const QuestaoNaContainerSchema =
  SchemaFactory.createForClass(QuestaoNaContainer);
