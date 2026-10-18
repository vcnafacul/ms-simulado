import {
  listaDeAnulados,
  numerosAnuladosDoContainer,
} from '../simulado/anuladas';

/**
 * Divergência da anulação (tickets/042, R3 — redefinida no card 20).
 *
 * Divergente = o histórico foi calculado com um CONJUNTO de números anulados
 * diferente das anuladas de agora no simulado. Não é mais "revisão atrás":
 * anular e desanular a mesma questão sem recálculo no meio sobe a revisão duas
 * vezes, mas a nota gravada já está certa — e não pode aparecer como
 * desatualizada nem gerar push (card 20).
 *
 * ⚠️ `numerosAnulados` é gravado SEMPRE ordenado (`listaDeAnulados`), no
 * `processAnswer` e no recálculo: a comparação de array do Mongo (`$ne`) é por
 * ordem. Histórico anterior à série não tem o campo = calculado sem anuladas.
 */
export function filtroDivergente(
  numerosAtuais: readonly number[],
  prefixo = '',
): Record<string, unknown> {
  const campo = `${prefixo}numerosAnulados`;
  // Sem anuladas agora: divergente é quem foi calculado com alguma.
  if (!numerosAtuais.length) return { [`${campo}.0`]: { $exists: true } };
  // Com anuladas: quem não tem exatamente esta lista (ausente casa o `$ne`).
  return { [campo]: { $ne: [...numerosAtuais] } };
}

export function estaDivergente(
  historico: { numerosAnulados?: number[] | null },
  numerosAtuais: readonly number[],
): boolean {
  const gravados = [...(historico.numerosAnulados ?? [])].sort((a, b) => a - b);
  if (gravados.length !== numerosAtuais.length) return true;
  return gravados.some((n, i) => n !== numerosAtuais[i]);
}

/** As anuladas de agora de um simulado, ordenadas — o lado "atual" da comparação. */
export function numerosDoSimulado(simulado: {
  questoes?: { numero?: number | null; anulacao?: unknown }[] | null;
}): number[] {
  return listaDeAnulados(
    numerosAnuladosDoContainer((simulado.questoes ?? []) as never),
  );
}

/**
 * Guarda de CONCORRÊNCIA do recálculo (não decide divergência): só regrava o
 * histórico que ainda está atrás da revisão `alvo`. Um `processAnswer` que
 * terminou no meio já gravou a revisão atual e vence.
 *
 * ⚠️ `$not: { $gte }`, nunca `$lt`: pelo type bracketing do BSON, `$lt` não
 * casa documento sem o campo — e todo histórico anterior à série não o tem.
 */
export function filtroAtrasDaRevisao(revisao: number): Record<string, unknown> {
  return { revisaoAnulacao: { $not: { $gte: revisao } } };
}
