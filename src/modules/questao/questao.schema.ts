import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { Prova } from '../prova/prova.schema';
import { Alternativa } from './enums/alternativa.enum';
import { EnemArea } from './enums/enem-area.enum';
import { Status } from './enums/status.enum';
import { QuestaoReview } from './questao.review.schema';

@Schema({ timestamps: true, versionKey: false })
export class Questao extends QuestaoReview {
  @Prop()
  @ApiProperty({ enum: EnemArea })
  public enemArea: EnemArea;

  @Prop({ ref: Frente.name, type: Types.ObjectId })
  @ApiProperty()
  public frente1: Frente;

  @Prop({ ref: Frente.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public frente2: Frente = null;

  @Prop({ ref: Frente.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public frente3: Frente = null;

  @Prop({ ref: Materia.name, type: Types.ObjectId })
  @ApiProperty()
  public materia: Materia;

  @Prop()
  @ApiProperty()
  public numero: number;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoQuestao: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public pergunta: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaA: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaA: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaB: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaB: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaC: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaC: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaD: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaD: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaE: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaE: string;

  @Prop({ select: false })
  public alternativa: Alternativa;

  @Prop()
  @ApiProperty()
  public imageId: string;

  @Prop({ required: false })
  @ApiProperty()
  public acertos: number;

  @Prop({ required: false })
  @ApiProperty()
  public quantidadeSimulado: number;

  @Prop({ required: false })
  @ApiProperty()
  public quantidadeResposta: number;

  @Prop({ required: false, default: Status.Pending, enum: Status })
  @ApiProperty()
  public status: Status;

  @Prop({ ref: Prova.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public prova?: Prova;

  @Prop({ required: false, default: [], type: [String] })
  @ApiProperty()
  public files: string[];
}

export const QuestaoSchema = SchemaFactory.createForClass(Questao);
