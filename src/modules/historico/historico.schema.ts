import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { Aproveitamento } from './types/aproveitamento';
import { Resposta } from './types/resposta';

@Schema({ timestamps: false, versionKey: false })
export class Historico extends BaseSchema {
  @Prop()
  @ApiProperty()
  public usuario: number;

  @Prop({ ref: Simulado.name, type: Types.ObjectId })
  public simulado: Simulado;

  @Prop({ type: [Object] })
  public respostas: Resposta[];

  @Prop({ type: Aproveitamento })
  public aproveitamento: Aproveitamento;

  @Prop()
  public tempoRealizado: number;

  @Prop()
  public questoesRespondidas: number;
}

export const HistoricoSchema = SchemaFactory.createForClass(Historico);
