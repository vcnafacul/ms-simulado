import { calcularAproveitamento } from '../../simulado/calcularAproveitamento';
import {
  numerosAnuladosDoContainer,
  listaDeAnulados,
} from '../../simulado/anuladas';
import { Questao } from '../../questao/questao.schema';
import { RespostaAproveitamento } from '../../simulado/valueObject/resposta-aproveitamento';
import { AproveitamentoHistorico } from '../types/aproveitamento';

/** Um slot do simulado AGORA: a questão (populada) no número, e se está anulada. */
export interface SlotParaRecalculo {
  questao: Questao;
  numero: number | null;
  anulacao?: unknown;
}

/** Uma resposta como ficou gravada no histórico. */
export interface RespostaGravada {
  questao: unknown;
  numero?: number | null;
  alternativaEstudante?: unknown;
  alternativaCorreta?: unknown;
  anulada?: boolean;
}

export interface DadosDoRecalculo {
  aproveitamento: AproveitamentoHistorico;
  acertos: number;
  questoesRespondidas: number;
  totalConsiderado: number;
  numerosAnulados: number[];
  respostas: RespostaGravada[];
  revisaoAnulacao: number;
  recalculadoEm: Date;
}

/**
 * `ok: false` traz o `motivo`; `ok: true`, os `dados`. (Sem união discriminada:
 * o projeto compila sem `strictNullChecks`, e o estreitamento não funciona.)
 */
export interface ResultadoDoRecalculo {
  ok: boolean;
  dados?: DadosDoRecalculo;
  motivo?: string;
}

const idDe = (q: unknown) => String((q as { _id?: unknown })?._id ?? q ?? '');

/**
 * A nota de um histórico JÁ processado, refeita com as anuladas de AGORA
 * (tickets/042, cards 10 e 12) — pura, sem I/O.
 *
 * ⚠️ **Casa resposta ↔ questão pelo NÚMERO gravado, não pelo id** (REVISÃO B3).
 * Uma nova versão troca o ponteiro do slot para a sucessora; o histórico
 * continua com o id da original. Casar por id trataria a resposta como "não
 * lida" e apagaria o acerto. O id é só o reserva, para histórico gravado antes
 * de `respostas[].numero` existir.
 *
 * ⚠️ **Gabarito GRAVADO** (o do momento da correção), e não o de hoje — mesma
 * regra do `recalcularAproveitamento`. Sem OMR, sem `updateQuestionAnswered`.
 *
 * ⚠️ Slot sem resposta gravada (questão que entrou no simulado depois) não tem
 * como ser recalculado: devolve `ok: false`, e quem chama conta como falha.
 */
export function recalcularHistorico(
  gravadas: RespostaGravada[],
  slots: SlotParaRecalculo[],
  revisao: number,
  agora: Date = new Date(),
): ResultadoDoRecalculo {
  const porNumero = new Map<number, RespostaGravada>();
  const porId = new Map<string, RespostaGravada>();
  for (const r of gravadas ?? []) {
    if (r.numero != null) porNumero.set(r.numero, r);
    else porId.set(idDe(r.questao), r);
  }
  const anulados = numerosAnuladosDoContainer(slots);

  const entradas: RespostaAproveitamento[] = [];
  const respostas: RespostaGravada[] = [];
  for (const slot of slots) {
    const r =
      (slot.numero != null ? porNumero.get(slot.numero) : undefined) ??
      porId.get(idDe(slot.questao));
    if (!r) {
      return {
        ok: false,
        motivo: `questão ${slot.numero ?? idDe(slot.questao)} sem resposta gravada`,
      };
    }
    const anulada = slot.numero != null && anulados.has(slot.numero);
    const alternativaCorreta = (r.alternativaCorreta ??
      slot.questao.alternativa) as never;
    entradas.push({
      questao: slot.questao,
      alternativaEstudante: r.alternativaEstudante as never,
      alternativaCorreta,
      materia: slot.questao.materia,
      frente: slot.questao.frente1,
      ...(anulada ? { anulada: true } : {}),
    });
    respostas.push({
      // ⚠️ O id GRAVADO: o histórico continua apontando a questão que o aluno leu.
      questao: r.questao,
      numero: slot.numero ?? r.numero ?? null,
      alternativaEstudante: r.alternativaEstudante,
      alternativaCorreta,
      ...(anulada ? { anulada: true } : {}),
    });
  }

  const consideradas = entradas.filter((e) => !e.anulada);
  return {
    ok: true,
    dados: {
      aproveitamento: calcularAproveitamento(entradas),
      acertos: consideradas.filter(
        (e) =>
          e.alternativaEstudante !== undefined &&
          e.alternativaEstudante === e.alternativaCorreta,
      ).length,
      questoesRespondidas: consideradas.filter(
        (e) => e.alternativaEstudante !== undefined,
      ).length,
      totalConsiderado: consideradas.length,
      numerosAnulados: listaDeAnulados(anulados),
      respostas,
      revisaoAnulacao: revisao,
      recalculadoEm: agora,
    },
  };
}
