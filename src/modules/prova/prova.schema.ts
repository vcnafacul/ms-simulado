import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Exame } from '../exame/exame.schema';
import { Questao } from '../questao/questao.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { Edicao } from './enums/edicao.enum';

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
    this.simulados = [];
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
  public enemAreas: string[];

  @Prop({ default: 1 })
  public inicialNumero: number = 1;
}

export const ProvaSchema = SchemaFactory.createForClass(Prova);
