import { BaseSchema } from 'src/shared/base/base.schema';
import { Exame } from '../exame/exame.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { EnemArea } from './enums/enem-area.enum';
import { Types } from 'mongoose';
import { Status } from './enums/status.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Caderno } from './enums/caderno.enum';

@Schema({ timestamps: true, versionKey: false })
export class Questao extends BaseSchema {
  @Prop({ ref: Exame.name, type: Types.ObjectId })
  @ApiProperty()
  public exame: Exame;

  @Prop()
  @ApiProperty()
  public ano: number;

  @Prop()
  @ApiProperty({ enum: Caderno })
  public caderno: Caderno;

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
  public alternativa: string;

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
}

export const QuestaoSchema = SchemaFactory.createForClass(Questao);
