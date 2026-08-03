import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Questao } from '../../questao/questao.schema';
import { Categoria } from '../../categoria/schemas/categoria.schema';
import {
  QuestaoNaContainer,
  QuestaoNaContainerSchema,
} from '../../prova/schemas/questao-na-container.schema';

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

  @Prop({ type: [QuestaoNaContainerSchema], default: [] })
  @ApiProperty({ type: QuestaoNaContainer, isArray: true, required: false })
  questoesNovo: QuestaoNaContainer[];

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

  @Prop({ required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  disponivelDe?: Date | null;

  @Prop({ required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  disponivelAte?: Date | null;
}

export const SimuladoSchema = SchemaFactory.createForClass(Simulado);

// Índice composto para o filtro de availability do getAvailable (Card 02).
// autoIndex (default true no MongooseModule) cria automaticamente no boot.
SimuladoSchema.index({
  categoria: 1,
  bloqueado: 1,
  disponivelDe: 1,
  disponivelAte: 1,
});
