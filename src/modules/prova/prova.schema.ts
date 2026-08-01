import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Questao } from '../questao/questao.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { Categoria } from '../categoria/schemas/categoria.schema';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { Edicao } from './enums/edicao.enum';

@Schema({ timestamps: true, versionKey: false })
export class Prova extends BaseSchema {
  constructor(item: CreateProvaDTOInput, categoria: Categoria) {
    super();
    this.edicao = item.edicao;
    this.categoria = categoria;
    this.ano = item.ano;
    this.filename = item.filename;
    this.gabarito = item.gabarito;
    this.aplicacao = item.aplicacao;
    this.criadorId = item.criadorId;
    this.cursinhoId = item.cursinhoId ?? null;
    this.simulados = [];
    this.questoes = [];
  }

  @Prop({ enum: Edicao })
  public edicao: Edicao;

  @Prop()
  public aplicacao: number;

  @Prop()
  public ano: number;

  @Prop({ ref: Categoria.name, type: Types.ObjectId })
  public categoria: Categoria;

  @Prop({
    type: [{ ref: 'Simulado', type: mongoose.Schema.Types.ObjectId }],
    default: [],
  })
  public simulados: Simulado[];

  @Prop({
    type: [{ ref: 'Questao', type: mongoose.Schema.Types.ObjectId }],
    default: [],
  })
  questoes: Questao[];

  @Prop()
  public nome: string;

  @Prop()
  public totalQuestao: number;

  @Prop()
  public totalQuestaoValidadas: number = 0;

  @Prop()
  public filename: string;

  @Prop()
  public gabarito?: string;

  @Prop()
  public enemAreas: string[];

  @Prop({ default: 1 })
  public inicialNumero: number = 1;

  @Prop({ required: true })
  public criadorId: string;

  @Prop({ required: false, default: null })
  public cursinhoId?: string | null;
}

export const ProvaSchema = SchemaFactory.createForClass(Prova);

ProvaSchema.index({ cursinhoId: 1 });
