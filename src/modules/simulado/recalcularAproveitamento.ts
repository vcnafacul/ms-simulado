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
  rawRespostas: { questao: unknown; alternativaEstudante?: unknown }[],
): { novo: AproveitamentoHistorico; mudou: boolean } {
  const novo = calcularAproveitamento(
    montarRespostasAproveitamento(questoes, rawRespostas),
  );
  return { novo, mudou: canonico(novo) !== canonico(gravado) };
}
