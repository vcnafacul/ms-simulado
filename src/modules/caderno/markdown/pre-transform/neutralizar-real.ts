/**
 * Neutraliza o `R$` de valores em real ANTES do parser.
 *
 * Medido: `custa R$ 50,00 e outro R$ 30,00` faz o `remark-math` casar os dois
 * cifrões e produzir `inlineMath(" 50,00 e outro R")`. Em prova brasileira
 * isso é comum, não exótico. Pior: `R$ 80,00 resulta em $0{,}8 \times 80$`
 * engole a prosa E quebra a fórmula legítima que vinha depois.
 *
 * Tem que ser antes do parser: o estrago acontece na tokenização, e depois de
 * virar nó `inlineMath` a informação já se perdeu.
 *
 * Desligar `singleDollarTextMath` não serve — o editor grava math inline como
 * `$x^2$`, então desligar mataria a feature principal.
 *
 * ⚠️ A âncora `(^|[^$])` à esquerda é o que protege `$R$`, que é fórmula
 * legítima e comuníssima (R de raio, de resistência). Sem ela,
 * `O raio $R$ e o dobro` vira `O raio $ e o dobro` e o cifrão órfão quebra a
 * matemática do resto do parágrafo.
 */
const PADRAO = /(^|[^$])R\$(?=[\s\d])/g;

/**
 * Caractere de uso privado do Unicode. O remark não atribui significado a ele,
 * então ele atravessa o parser intacto. O handler de `text` o devolve como
 * `R\$` no LaTeX.
 */
export const MARCADOR_REAL = '';

export function neutralizarReal(markdown: string): string {
  return markdown.replace(PADRAO, `$1${MARCADOR_REAL}`);
}
