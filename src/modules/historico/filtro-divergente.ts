/**
 * O histórico cuja nota foi calculada com uma revisão de anulação ANTERIOR à
 * do simulado (tickets/042, R3) — na forma de filtro do Mongo.
 *
 * ⚠️ **`$not: { $gte }`, nunca `$lt`.** Pelo type bracketing do BSON,
 * `{ revisaoAnulacao: { $lt: 1 } }` NÃO casa documento sem o campo — e todo
 * histórico gravado antes desta série não tem o campo. Com `$lt`, nenhum deles
 * apareceria como divergente, e o recálculo nunca os regravaria.
 *
 * Em código (um documento já lido), a mesma regra é `(h.revisaoAnulacao ?? 0) < alvo`
 * — ver `estaDivergente`.
 */
export function filtroDivergente(revisao: number): Record<string, unknown> {
  return { revisaoAnulacao: { $not: { $gte: revisao } } };
}

export function estaDivergente(
  historico: { revisaoAnulacao?: number | null },
  simulado: { revisaoAnulacao?: number | null },
): boolean {
  return (historico.revisaoAnulacao ?? 0) < (simulado.revisaoAnulacao ?? 0);
}
