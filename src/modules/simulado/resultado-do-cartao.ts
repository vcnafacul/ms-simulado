/**
 * Os números do push de resultado do cartão (tickets/028, R2) — puro.
 *
 * - aproveitamento = acertos ÷ total (a mesma política do relatório);
 * - erros = respostas MARCADAS e erradas;
 * - em branco = o que não foi lido/marcado.
 */
export function numerosDoResultado(h: {
  total: number;
  acertos: number;
  questoesRespondidas: number;
}) {
  const total = Math.max(0, h.total);
  const acertos = Math.min(Math.max(0, h.acertos), total);
  const respondidas = Math.min(Math.max(acertos, h.questoesRespondidas), total);
  return {
    total,
    acertos,
    erros: respondidas - acertos,
    emBranco: total - respondidas,
    aproveitamento: total ? Math.round((acertos / total) * 100) : 0,
  };
}
