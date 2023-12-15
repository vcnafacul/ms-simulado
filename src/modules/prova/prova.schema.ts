import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Edicao } from './enums/edicao.enum';
import { Exame } from '../exame/exame.schema';
import { Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { CreateProvaDTOInput } from './dtos/create.dto.input';

@Schema({ timestamps: true, versionKey: false })
export class Prova extends BaseSchema {
  constructor(item: CreateProvaDTOInput, exame: Exame) {
    super();
    this.edicao = item.edicao;
    this.exame = exame;
    this.ano = item.ano;
    this.filename = item.filename;
    this.aplicacao = item.aplicacao;
    this.totalQuestao = item.totalQuestao;
  }
  @Prop({ enum: Edicao })
  @ApiProperty()
  public edicao: Edicao;

  @Prop()
  public aplicacao: number;

  @Prop()
  public ano: number;

  @Prop({ ref: Exame.name, type: Types.ObjectId })
  public exame: Exame;

  @Prop()
  public nome: string;

  @Prop()
  public totalQuestao: number;

  @Prop()
  public totalQuestaoCadastradas: number = 0;

  @Prop()
  public totalQuestaoValidadas: number = 0;

  @Prop()
  public filename: string;
}

export const ProvaSchema = SchemaFactory.createForClass(Prova);
