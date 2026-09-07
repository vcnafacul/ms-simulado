/**
 * Escapa texto para LaTeX.
 *
 * Não usa a lib `escape-latex`: ela está congelada desde 2018 e não trata
 * `~`, `<`, `>` nem `|` — e com fontes T1/OT1 um `a < b` renderiza como
 * `a ¡ b`. São dez linhas de regex, não justificam dependência.
 *
 * ⚠️ Passada ÚNICA, de propósito. Escapar em várias passadas quebra: a barra
 * invertida vira `\textbackslash{}` e a passada seguinte escaparia as chaves
 * que ela mesma inseriu, produzindo `\textbackslash\{\}`.
 */
const MAPA: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
  '"': '\\textquotedbl{}',
};

export function escapeLatex(texto: string): string {
  return texto.replace(/[\\{}$&#_%~^<>|"]/g, (c) => MAPA[c]);
}
