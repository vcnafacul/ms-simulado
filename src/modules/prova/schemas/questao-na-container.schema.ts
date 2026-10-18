import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { Questao } from '../../questao/questao.schema';
import {
  Anulacao,
  AnulacaoSchema,
} from '../../questao/anulacao/anulacao.schema';

@Schema({ _id: true, versionKey: false })
export class QuestaoNaContainer {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Questao', required: true })
  questao: Questao;

  // Nullable: uma questão pode estar vinculada à prova sem posição definida
  // ainda (o admin remove o número na aba Classificação). Simulado com questão
  // sem número nunca é liberado — ver `todasNumeradas` em simulado/helpers.
  @Prop({ required: false, type: Number, default: null })
  numero: number | null;

  /**
   * A questão está ANULADA neste slot (tickets/042, D1). Ausente = válida.
   *
   * ⚠️ **Fonte da verdade para a nota.** Fica no slot (prova + número) e não
   * segue a questão: `substituirQuestao`/`aplicarAtualizacoes` trocam só o
   * ponteiro `questao`, e a sucessora herda a anulação do lugar (A11).
   *
   * ⚠️ Não entra em `Status`, `calcularBloqueado` nem na composição (R1): a
   * anulada continua ocupando o número, e o simulado continua liberado.
   */
  @Prop({ type: AnulacaoSchema, required: false, default: undefined })
  anulacao?: Anulacao;
}

export const QuestaoNaContainerSchema =
  SchemaFactory.createForClass(QuestaoNaContainer);
