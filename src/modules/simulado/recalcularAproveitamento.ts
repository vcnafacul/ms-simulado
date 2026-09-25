import { AproveitamentoHistorico } from '../historico/types/aproveitamento';
import { Questao } from '../questao/questao.schema';
import {
  calcularAproveitamento,
  montarRespostasAproveitamento,
} from './calcularAproveitamento';

/**
 * Forma comparável de um aproveitamento: ids como string, listas ordenadas por
 * id, percentuais arredondados.
 *
 * ⚠️ Sem isto, a ordem das matérias (que vem da ordem das questões) e o ruído
 * de ponto flutuante fariam o script regravar históricos que já estão certos —
 * e a segunda execução não daria zero.
 */
function canonico(ap: AproveitamentoHistorico | null | undefined): string {
  if (!ap) return 'null';
  const r = (n: unknown) =>
    typeof n === 'number' ? Math.round(n * 1e9) / 1e9 : null;
  const porId = <T extends { id: unknown }>(xs: T[] = []) =>
    [...xs].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({
    geral: r(ap.geral),
    materias: porId(ap.materias).map((m) => ({
      id: String(m.id),
      a: r(m.aproveitamento),
      q: m.questoes ?? null,
      frentes: porId(m.frentes).map((f) => ({
        id: String(f.id),
        a: r(f.aproveitamento),
        q: f.questoes ?? null,
      })),
    })),
  });
}

/**
 * O aproveitamento que o processamento de HOJE daria a este histórico, e se
 * ele difere do gravado (contagem-por-materia 02).
 *
 * ⚠️ Mesmas funções do `processAnswer` — `montarRespostasAproveitamento` e
 * `calcularAproveitamento` —, nunca uma cópia da regra.
 *
 * ⚠️ Usa as questões do simulado e a classificação delas **como estão hoje**.
 * Questão reclassificada depois do cartão entra com a frente nova.
 */
export function recalcularAproveitamento(
  gravado: AproveitamentoHistorico | null | undefined,
  questoes: Questao[],
  respostas: {
    questao: unknown;
    alternativaEstudante?: unknown;
    alternativaCorreta?: unknown;
  }[],
): { novo: AproveitamentoHistorico; mudou: boolean } {
  /*
    ⚠️ **O gabarito é o GRAVADO, não o de hoje.** O `montarRespostas...` usa o
    `questao.alternativa` atual, que é o certo no processamento — e errado
    aqui: medido no clone, 8 de 23 históricos tinham questão com o gabarito
    TROCADO depois do cartão, e o recálculo recorrigia a prova (o `geral` caía
    0,2 e o `acertos` gravado ficava contradizendo). Este script conserta a
    CONTAGEM por matéria; recorrigir gabarito é outra decisão.
  */
  const gabaritoGravado = new Map(
    respostas
      .filter((r) => r.alternativaCorreta !== undefined)
      .map((r) => [String(r.questao), r.alternativaCorreta]),
  );
  const entradas = montarRespostasAproveitamento(questoes, respostas).map(
    (e) =>
      gabaritoGravado.has(e.questao._id.toString())
        ? {
            ...e,
            alternativaCorreta: gabaritoGravado.get(
              e.questao._id.toString(),
            ) as never,
          }
        : e,
  );
  const novo = calcularAproveitamento(entradas);
  return { novo, mudou: canonico(novo) !== canonico(gravado) };
}
