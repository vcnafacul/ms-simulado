/**
 * Comandos LaTeX barrados dentro de fórmula.
 *
 * A matemática passa sem escape — o editor grava LaTeX de verdade e escapar
 * mataria a feature. Mas isso abre um canal: quem cadastra questão pode
 * escrever `$\input{/etc/passwd}$`, o KaTeX mostra erro no editor e salva
 * mesmo assim, e o `.tex` gerado carrega o comando intacto.
 *
 * Na fase 1 quem compila é o usuário, na máquina dele ou no Overleaf — as
 * proteções que o card 08 planeja (`openin_any=p`, `-no-shell-escape`) não
 * existem lá. Esta lista é o que cobre essa janela.
 *
 * ⚠️ Defesa em profundidade, NÃO substituto: o card 08 continua obrigado a
 * configurar o compilador do servidor.
 *
 * São oito comandos que nenhuma fórmula de prova usa, então o falso positivo
 * é quase zero. `write18` vem antes de `write` na alternância porque a regex
 * casa a primeira alternativa que serve.
 */
const BARRADOS = [
  'write18',
  'write',
  'input',
  'include',
  'openin',
  'read',
  'catcode',
  'csname',
];

/** `(?![A-Za-z])` é o limite de nome do LaTeX: `\inputs` não é `\input`. */
const PADRAO = new RegExp(`\\\\(${BARRADOS.join('|')})(?![A-Za-z])`);

/** Devolve o comando barrado encontrado, ou `null` se a fórmula está limpa. */
export function comandoBarrado(formula: string): string | null {
  const achado = PADRAO.exec(formula);
  return achado ? `\\${achado[1]}` : null;
}
