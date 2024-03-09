import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Edicao } from './enums/edicao.enum';
import { Exame } from '../exame/exame.schema';
import mongoose, { Types } from 'mongoose';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { Questao } from '../questao/questao.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';

@Schema({ timestamps: true, versionKey: false })
export class Prova extends BaseSchema {
  constructor(item: CreateProvaDTOInput, exame: Exame, tipo: TipoSimulado) {
    super();
    this.edicao = item.edicao;
    this.exame = exame;
    this.tipo = tipo;
    this.ano = item.ano;
    this.filename = item.filename;
    this.aplicacao = item.aplicacao;
    this.totalQuestao = tipo.quantidadeTotalQuestao;
    this.questoes = [];
  }
  @Prop({ enum: Edicao })
  public edicao: Edicao;

  @Prop()
  public aplicacao: number;

  @Prop()
  public ano: number;

  @Prop({ ref: Exame.name, type: Types.ObjectId })
  public exame: Exame;

  @Prop({ ref: TipoSimulado.name, type: Types.ObjectId })
  public tipo: TipoSimulado;

  @Prop({
    type: [{ ref: 'Simulado', type: mongoose.Schema.Types.ObjectId }],
  })
  public simulado: Simulado[];

  @Prop({ type: [{ ref: 'Questao', type: mongoose.Schema.Types.ObjectId }] })
  questoes: Questao[];

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
