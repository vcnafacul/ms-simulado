import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema({ timestamps: true, versionKey: false })
export class Colaborador extends BaseSchema {
  @Prop({ required: true, unique: true })
  public colaboradorId: string; // ID da outra aplicação

  @Prop({ required: true })
  public nome: string;

  @Prop({ required: true })
  public email: string;

  @Prop({ required: true })
  public userId: string;

  @Prop({
    type: [
      {
        frenteId: { type: String, required: true },
        frenteNome: { type: String, required: true },
        materiaId: { type: String, required: true },
        materiaNome: { type: String, required: true },
        adicionadoEm: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  public afinidades: {
    frenteId: string;
    frenteNome: string;
    materiaId: string;
    materiaNome: string;
    adicionadoEm: Date;
  }[];
}

export const ColaboradorSchema = SchemaFactory.createForClass(Colaborador);

// Índice para busca rápida por colaboradorId
ColaboradorSchema.index({ colaboradorId: 1 }, { unique: true });
