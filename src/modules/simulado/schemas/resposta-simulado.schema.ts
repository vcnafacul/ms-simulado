import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Resposta } from './resposta.schema';

@Schema({ timestamps: true, versionKey: false })
export class RespostaSimulado extends BaseSchema {
  @Prop()
  @ApiProperty()
  idEstudante: number;

  @Prop()
  @ApiProperty()
  idSimulado: string;

  @Prop()
  @ApiProperty({ type: Resposta, isArray: true })
  respostas: Resposta[];
}

export const RespostaSimuladoSchema =
  SchemaFactory.createForClass(RespostaSimulado);
