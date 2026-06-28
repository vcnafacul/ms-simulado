import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Regra } from './regra.schemas';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Exame } from '../../exame/exame.schema';

@Schema({ timestamps: true, versionKey: false })
export class Categoria extends BaseSchema {
  @Prop({ unique: true })
  @ApiProperty()
  public nome: string;

  @Prop()
  @ApiProperty()
  public duracao: number;

  @Prop({ required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  public quantidadeTotalQuestao: number | null;

  @Prop([Regra])
  @ApiProperty({ isArray: true, type: Regra })
  public regras: Regra[];

  @Prop({ ref: Exame.name, type: Types.ObjectId, required: true })
  @ApiProperty()
  public exame: Exame;

  @Prop({ required: true, default: false })
  @ApiProperty({ default: false })
  public custom: boolean;

  @Prop({ required: true, default: true })
  @ApiProperty({ default: true })
  public selecionavel: boolean;

  @Prop({ required: false, default: '' })
  @ApiProperty({ required: false, default: '' })
  public descricao: string;
}

export const CategoriaSchema = SchemaFactory.createForClass(Categoria);
