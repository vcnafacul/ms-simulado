import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { now } from 'mongoose';

/**
 * Card 36 — quem excluiu qual envio de cartão, e quando.
 *
 * ⚠️ **Coleção própria, e não `deleted: true` no `Historico`**: o índice único
 * `cartao_por_estudante` não olha o `deleted`, e o histórico marcado impediria
 * reenviar o cartão do estudante certo — que é justamente o motivo de excluir.
 *
 * `historico` guarda o documento inteiro como estava: é o que permite
 * responder "que nota a Ana Souza tinha antes de excluírem?" sem banco de
 * backup.
 */
@Schema({ collection: 'cartoes_excluidos', versionKey: false })
export class CartaoExcluido {
  @Prop({ required: true, index: true })
  public historicoId: string;

  @Prop({ required: true })
  public usuario: string;

  @Prop({ required: false })
  public simuladoId?: string;

  @Prop({ required: true, index: true })
  public cursinhoId: string;

  /** O userId de quem excluiu — resolvido do JWT na api. */
  @Prop({ required: true })
  public excluidoPor: string;

  @Prop({ required: true })
  public status: string;

  @Prop({ required: false })
  public imageKey?: string;

  @Prop({ type: Object, required: true })
  public historico: Record<string, unknown>;

  @Prop({ default: () => now() })
  public excluidoEm?: Date;
}

export const CartaoExcluidoSchema =
  SchemaFactory.createForClass(CartaoExcluido);
