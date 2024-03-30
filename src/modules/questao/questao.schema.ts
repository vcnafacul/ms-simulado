import { BaseSchema } from 'src/shared/base/base.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { EnemArea } from './enums/enem-area.enum';
import { Types } from 'mongoose';
import { Status } from './enums/status.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Alternativa } from './enums/alternativa.enum';
import { Prova } from '../prova/prova.schema';

@Schema({ timestamps: true, versionKey: false })
export class Questao extends BaseSchema {
  @Prop()
  @ApiProperty({ enum: EnemArea })
  public enemArea: EnemArea;

  @Prop({ ref: Frente.name, type: Types.ObjectId })
  @ApiProperty()
  public frente1: Frente;

  @Prop({ ref: Frente.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public frente2: Frente;

  @Prop({ ref: Frente.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public frente3: Frente;

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
  public textoAlternativaA: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaB: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaC: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaD: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaE: string;

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

  @Prop({ required: false })
  @ApiProperty()
  public classificationExam: boolean;

  @Prop({ required: false })
  @ApiProperty()
  public classificationFront: boolean;

  @Prop({ required: false })
  @ApiProperty()
  public questionText: boolean;
  
  @Prop({ required: false })
  @ApiProperty()
  public image: boolean;

  @Prop({ required: false })
  @ApiProperty()
  public rightAnswer: boolean;


  @Prop({ required: false, default: Status.Pending, enum: Status })
  @ApiProperty()
  public status: Status;

  @Prop({ ref: Prova.name, type: Types.ObjectId })
  @ApiProperty()
  public prova: Prova;
}

export const QuestaoSchema = SchemaFactory.createForClass(Questao);
