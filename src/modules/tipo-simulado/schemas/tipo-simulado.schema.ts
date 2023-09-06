import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Regra } from './regra.schemas';

@Schema({ timestamps: true, versionKey: false })
export class TipoSimulado extends BaseSchema {
  @Prop({ unique: true })
  public nome: string;

  @Prop()
  public duracao: number;

  @Prop()
  public quantidadeTotalQuestao: number;

  @Prop([Regra])
  public regras: Regra[];
}

export const TipoSimuladoSchema = SchemaFactory.createForClass(TipoSimulado);
