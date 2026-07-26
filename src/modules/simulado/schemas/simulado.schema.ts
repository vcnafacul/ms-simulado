import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Questao } from '../../questao/questao.schema';
import { Categoria } from '../../categoria/schemas/categoria.schema';

@Schema({ timestamps: true, versionKey: false })
export class Simulado extends BaseSchema {
  @Prop()
  @ApiProperty()
  nome: string;

  @Prop()
  @ApiProperty()
  descricao: string;

  @Prop({ ref: Categoria.name, type: Types.ObjectId })
  @ApiProperty()
  categoria: Categoria;

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

  @Prop({ required: false })
  @ApiProperty()
  criadorId?: string;

  @Prop({ required: false, default: null })
  @ApiProperty()
  cursinhoId?: string | null;
}

export const SimuladoSchema = SchemaFactory.createForClass(Simulado);
