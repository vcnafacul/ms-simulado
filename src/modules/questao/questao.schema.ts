import { BaseSchema } from 'src/shared/base/base.schema';
import { Exame } from '../exame/exame.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { EnemArea } from 'src/enums/enem-area.enum';

@Schema({ timestamps: true, versionKey: false })
export class Questao extends BaseSchema {
  @Prop({ ref: Exame.name })
  public exame: Exame;

  @Prop()
  public ano: number;

  @Prop()
  public caderno: string;

  @Prop()
  public enemArea: EnemArea;

  @Prop({ ref: Frente.name })
  public frente1: Frente;

  @Prop({ ref: Frente.name, required: false })
  public frente2: Frente;

  @Prop({ ref: Frente.name, required: false })
  public frente3: Frente;

  @Prop({ ref: Materia.name })
  public materia: Materia;

  @Prop()
  public numero: number;

  @Prop()
  public textoQuestao: string;

  @Prop()
  public textoAlternativaA: string;

  @Prop()
  public textoAlternativaB: string;

  @Prop()
  public textoAlternativaC: string;

  @Prop()
  public textoAlternativaD: string;

  @Prop()
  public textoAlternativaE: string;

  @Prop({ select: false })
  public alternativa: string;

  @Prop()
  public imageId: string;

  @Prop({ required: false })
  public acertos: number;

  @Prop({ required: false })
  public quantidadeSimulado: number;

  @Prop({ required: false })
  public quantidadeResposta: number;
}

export const QuestaoSchema = SchemaFactory.createForClass(Materia);
