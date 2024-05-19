import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Questao } from '../../questao/questao.schema';
import { TipoSimulado } from '../../tipo-simulado/schemas/tipo-simulado.schema';

@Schema({ timestamps: true, versionKey: false })
export class Simulado extends BaseSchema {
  @Prop()
  @ApiProperty()
  nome: string;

  @Prop()
  @ApiProperty()
  descricao: string;

  @Prop({ ref: TipoSimulado.name, type: Types.ObjectId })
  @ApiProperty()
  tipo: TipoSimulado;

  @Prop({
    type: [{ ref: 'Questao', type: mongoose.Schema.Types.ObjectId }],
    default: [],
    required: false,
  })
  @ApiProperty({ type: Questao, isArray: true })
  questoes: Questao[];

  @Prop({ required: false, default: 0 })
  @ApiProperty()
  aproveitamento?: number;

  @Prop({ required: false, default: 0 })
  @ApiProperty()
  vezesRespondido?: number;

  @Prop({ required: false, default: true })
  @ApiProperty()
  bloqueado?: boolean;
}

export const SimuladoSchema = SchemaFactory.createForClass(Simulado);
