/**
 * Os NÚMEROS anulados de um container (tickets/042, R2).
 *
 * ⚠️ **Por número, nunca por id de questão.** A anulação mora no slot
 * (prova + número): uma nova versão troca o ponteiro do slot para a sucessora
 * e o histórico continua apontando a original. Identificar a anulada pelo id
 * erraria justamente o recálculo (card 12).
 */
export function numerosAnuladosDoContainer(
  questoes: { numero: number | null; anulacao?: unknown }[],
): Set<number> {
  const numeros = new Set<number>();
  for (const qc of questoes ?? []) {
    if (qc.anulacao && qc.numero != null) numeros.add(qc.numero);
  }
  return numeros;
}

/** Em ordem, para gravar no histórico e mostrar. */
export function listaDeAnulados(numeros: ReadonlySet<number>): number[] {
  return [...numeros].sort((a, b) => a - b);
}
