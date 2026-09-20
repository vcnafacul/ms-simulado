import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { HistoricoStatus } from './enums/historico-status.enum';
import { AproveitamentoHistorico } from './types/aproveitamento';
import { FalhaHistorico } from './types/falha';
import { Resposta } from './types/resposta';

@Schema({ timestamps: false, versionKey: false })
export class Historico extends BaseSchema {
  @Prop()
  @ApiProperty()
  public usuario: string;

  @Prop()
  @ApiProperty()
  public ano: number;

  @Prop({ ref: Simulado.name, type: Types.ObjectId })
  @ApiProperty()
  public simulado: Simulado;

  @Prop({ type: [Object] })
  @ApiProperty()
  public respostas: Resposta[];

  @Prop({ type: AproveitamentoHistorico })
  @ApiProperty()
  public aproveitamento: AproveitamentoHistorico;

  @Prop()
  @ApiProperty()
  public tempoRealizado: number;

  @Prop()
  @ApiProperty()
  public questoesRespondidas: number;

  @Prop({
    type: String,
    enum: HistoricoStatus,
    default: HistoricoStatus.Pending,
    index: true,
  })
  @ApiProperty({ enum: HistoricoStatus })
  public status: HistoricoStatus;

  @Prop({ type: [Object], default: null })
  public rawRespostas: any[] | null;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public imageKey?: string;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public cartaoCode?: string;

  @Prop({ type: Object, required: false })
  @ApiProperty({ required: false })
  public falha?: FalhaHistorico;

  /**
   * Quando o cartão foi (re)enviado ao OMR pela última vez. Base do rate limit
   * do reprocessamento.
   *
   * ⚠️ Campo próprio porque **não há de onde derivar**: este schema é
   * `@Schema({ timestamps: false })` e não tem `createdAt` nem `updatedAt`.
   *
   * ⚠️ Ausente = nunca tentou. Documento antigo passa direto na primeira
   * tentativa, sem migração.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public ultimaTentativaEm?: Date;

  /**
   * Identifica o acionamento do OMR que está em voo.
   *
   * ⚠️ Muda a cada acionamento, e é o que permite descartar o callback de uma
   * tentativa que não é mais a corrente: no caminho `reprocessar` a `imageKey`
   * é reusada de propósito (a foto não mudou), então ela não distingue as
   * tentativas — e o `arq` do ms-omr reentrega até três vezes.
   *
   * ⚠️ **Opcional.** Histórico criado antes deste card não tem, e o callback
   * correspondente precisa continuar sendo aceito.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public tentativaId?: string;
}

export const HistoricoSchema = SchemaFactory.createForClass(Historico);

HistoricoSchema.index(
  { imageKey: 1 },
  { unique: true, partialFilterExpression: { imageKey: { $type: 'string' } } },
);
