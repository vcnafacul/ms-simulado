import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Números por cursinho que só sobem (tickets/025, card 02). Hoje só as
 * questões aprovadas por colaboradores do cursinho — o impacto da página
 * pública.
 */
@Schema({
  collection: 'contador_cursinho',
  timestamps: true,
  versionKey: false,
})
export class ContadorCursinho {
  @Prop({ required: true, unique: true })
  cursinhoId: string;

  @Prop({ default: 0 })
  questoesAprovadas: number;
}

export const ContadorCursinhoSchema =
  SchemaFactory.createForClass(ContadorCursinho);
