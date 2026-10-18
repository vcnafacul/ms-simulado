import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

export enum StatusDoRecalculo {
  naFila = 'na_fila',
  processando = 'processando',
  concluido = 'concluido',
  falhou = 'falhou',
}

export const STATUS_ATIVOS = [
  StatusDoRecalculo.naFila,
  StatusDoRecalculo.processando,
];

/** Quem teve a nota regravada — base dos indicadores (api, card 14) e do push (17). */
export class AfetadoDoRecalculo {
  @Prop() @ApiProperty() usuario: string;
  @Prop() @ApiProperty() historicoId: string;
  /** `YYYY-MM` do `createdAt` do histórico — o mês do agregado da turma. */
  @Prop() @ApiProperty() mes: string;
  /**
   * A nota antes e depois deste recálculo (card 20): a api não avisa o aluno
   * cuja nota voltou ao que era (anular → recalcular → desanular → recalcular).
   * `acertosAntes` ausente = histórico antigo sem a contagem: avisa.
   */
  @Prop() @ApiProperty({ required: false }) acertosAntes?: number;
  @Prop() @ApiProperty({ required: false }) totalAntes?: number;
  @Prop() @ApiProperty() acertosDepois: number;
  @Prop() @ApiProperty() totalDepois: number;
}

/**
 * Um recálculo por anulação pedido no relatório (tickets/042, card 12, R5).
 *
 * ⚠️ **O estado mora aqui, não na fila.** A fila leva só o `jobId`; com
 * `QUEUE_DRIVER=memory` ela morre com o processo, e o boot retoma os jobs
 * `na_fila`/`processando` lendo esta coleção.
 *
 * ⚠️ **Um job ativo por recorte** (R6): `chave` = cursinho + simulados
 * ordenados, com índice único parcial em `ativo: true`. Dois cliques (ou duas
 * abas) ao mesmo tempo não criam dois jobs: o segundo bate no índice e recebe
 * o ativo.
 */
@Schema({
  timestamps: false,
  versionKey: false,
  collection: 'recalculos_anulacao',
})
export class RecalculoAnulacao extends BaseSchema {
  @Prop({ type: [String], required: true }) simuladoIds: string[];
  @Prop({ type: String, required: false, default: null }) provaId?:
    | string
    | null;
  @Prop({ required: true }) cursinhoId: string;
  @Prop({ required: true }) chave: string;
  /** `true` enquanto `na_fila`/`processando`. Some (unset) ao terminar. */
  @Prop({ type: Boolean, required: false }) ativo?: boolean;

  @Prop({
    type: String,
    enum: Object.values(StatusDoRecalculo),
    required: true,
  })
  status: StatusDoRecalculo;

  /** Divergentes quando o job começou (o denominador do progresso). */
  @Prop({ default: 0 }) total: number;
  @Prop({ default: 0 }) processados: number;
  @Prop({ default: 0 }) falhas: number;
  /** Passadas pelo recorte: anulação nova no meio pede mais uma (teto 5). */
  @Prop({ default: 0 }) passadas: number;

  @Prop({ type: [Object], default: [] }) afetados: AfetadoDoRecalculo[];
  /**
   * Os que não casaram com o container. Continuam divergentes, mas não são
   * tentados de novo nas passadas seguintes (nem contam duas vezes).
   */
  @Prop({ type: [String], default: [] }) falhasIds: string[];
  @Prop({ type: [Number], default: [] }) numerosAnulados: number[];

  @Prop({ type: String, required: false }) solicitadoPor?: string;
  @Prop({ type: Date, required: true }) criadoEm: Date;
  @Prop({ type: Date, required: false }) iniciadoEm?: Date;
  @Prop({ type: Date, required: false }) concluidoEm?: Date;
  @Prop({ type: String, required: false }) erro?: string;
  /** A api recebeu o fim do job (indicadores + push). Ausente = reenviar. */
  @Prop({ type: Date, required: false }) avisadoEm?: Date;
}

export const RecalculoAnulacaoSchema =
  SchemaFactory.createForClass(RecalculoAnulacao);

RecalculoAnulacaoSchema.index(
  { chave: 1 },
  {
    unique: true,
    name: 'um_ativo_por_recorte',
    partialFilterExpression: { ativo: true },
  },
);
RecalculoAnulacaoSchema.index({ chave: 1, criadoEm: -1 });
RecalculoAnulacaoSchema.index({ status: 1 });

export const chaveDoRecorte = (cursinhoId: string, simuladoIds: string[]) =>
  `${cursinhoId}:${[...simuladoIds].sort().join(',')}`;
