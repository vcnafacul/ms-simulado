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

  /**
   * ⚠️ **Pode faltar** (tickets/038, R9): no cartão DA PROVA do ENEM Dia 1 do
   * cursinho, o simulado só é conhecido no callback do OMR, pelo idioma
   * marcado. Até lá o histórico tem só a `prova`.
   */
  @Prop({ ref: Simulado.name, type: Types.ObjectId })
  @ApiProperty({ required: false, nullable: true })
  public simulado?: Simulado | null;

  /**
   * A prova do cartão (tickets/038, R8a/R9). Preenchida em todo cartão cujo
   * simulado está numa prova — e em todo cartão DA PROVA. `null`/ausente:
   * simulado digital, histórico antigo sem a migração 0007, ou simulado que não
   * está em prova nenhuma.
   *
   * ⚠️ Ref por nome (string): importar o `Prova` aqui fecha um ciclo de imports
   * (prova → simulado → … → histórico).
   */
  @Prop({ ref: 'Prova', type: Types.ObjectId, required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  public prova?: Types.ObjectId | null;

  /**
   * `true` só no cartão impresso pela PROVA (um cartão para os simulados dela,
   * tickets/038). É o que separa as duas regras de "um cartão por estudante":
   * por prova aqui, por simulado no cartão do simulado (R10).
   */
  @Prop({ type: Boolean, required: false })
  @ApiProperty({ required: false })
  public cartaoDaProva?: boolean;

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

  /**
   * Quantas questões o estudante acertou — o número absoluto.
   *
   * ⚠️ **Contado no `processAnswer`, nunca derivado de
   * `aproveitamento.geral`** (card 08): a fração arredondada × total produz
   * `44` onde o aluno fez `45`, e é um número que ele confere à mão contra o
   * próprio cartão.
   *
   * ⚠️ **Opcional na prática**: histórico gravado ANTES do card 08 não tem o
   * campo, e o relatório trata ausência como ausência — não como zero acertos.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public acertos?: number;

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

/**
 * ⚠️ **Um cartão por estudante.** A checagem do `CartaoHistoricoService` é
 * "consulta, depois insere" — dois envios quase juntos (duplo clique) passavam
 * os dois. O índice é quem fecha a corrida.
 *
 * Parcial em `cartaoCode`: o histórico do simulado DIGITAL não tem cartão, e
 * a mesma pessoa pode fazer o mesmo simulado online mais de uma vez.
 *
 * ⚠️ `name` explícito — ver o `caderno-template.schema.ts`: sem nome, um
 * conflito de índice some calado no `autoIndex`.
 */
/*
 * ⚠️ tickets/038: `prova` entrou na chave (v2). Com o simulado vazio até o
 * callback, dois cartões DA PROVA do mesmo aluno em provas diferentes (os dois
 * "#001", porque o contador é por prova) colidiam em `{usuario, null, "001"}`.
 * No cartão do simulado nada muda: a prova é função do simulado. A migração
 * 0007 apaga o `cartao_por_estudante` (v1) e cria este.
 */
HistoricoSchema.index(
  { usuario: 1, simulado: 1, prova: 1, cartaoCode: 1 },
  {
    unique: true,
    name: 'cartao_por_estudante_v2',
    partialFilterExpression: { cartaoCode: { $type: 'string' } },
  },
);

/**
 * ⚠️ **Um cartão da PROVA por estudante** (tickets/038, R10): não dá para
 * mandar um cartão de Inglês e outro de Espanhol para o mesmo aluno na mesma
 * prova. Parcial em `cartaoDaProva: true` — o cartão do simulado segue a regra
 * de cima (por simulado), porque nas provas da plataforma o aluno pode fazer
 * dois simulados da mesma prova.
 *
 * ⚠️ Criado pela migração 0007, e não só pelo `autoIndex` (que falha calado).
 */
HistoricoSchema.index(
  { usuario: 1, prova: 1 },
  {
    unique: true,
    name: 'cartao_da_prova_por_estudante',
    partialFilterExpression: { cartaoDaProva: true },
  },
);
