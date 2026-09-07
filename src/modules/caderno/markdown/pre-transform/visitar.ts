/**
 * Walker mínimo do mdast, em pré-ordem.
 *
 * Existe em vez do `unist-util-visit` por ser seis linhas contra mais uma
 * dependência ESM — e porque o `agrupar-html` precisa mexer no array de
 * filhos durante a caminhada, o que o visit da lib desencoraja.
 *
 * ⚠️ Não use este walker para transformações que alterem `children`: ele
 * itera o array vivo. O `agrupar-html` faz a própria recursão por isso.
 */
export function visitar(no: any, fn: (no: any) => void): void {
  fn(no);
  if (Array.isArray(no?.children)) {
    for (const filho of no.children) visitar(filho, fn);
  }
}
