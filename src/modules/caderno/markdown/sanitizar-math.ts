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
 * configurar o compilador do servidor. E ⚠️ isto é uma lista de bloqueio, com
 * a fraqueza estrutural de toda lista de bloqueio: cobre o que se conhece.
 * A primeira versão só casava o início do nome, e deixava passar
 * `\InputIfFileExists` e `\lstinputlisting` — ambos leem arquivo, o primeiro
 * é kernel do LaTeX2e. Por isso o casamento agora é por RADICAL, em qualquer
 * posição do nome e sem diferenciar maiúscula.
 */

/** Radicais de I/O de arquivo. Nenhum comando de matemática os contém. */
const RADICAIS = [
  'input',
  'include',
  'openin',
  'openout',
  'read',
  'write',
  'catcode',
  'csname',
  'filecontents',
];

/**
 * Casamento exato, só para dar o nome preciso no aviso (`\write18`, não
 * `\write`). Ordem importa: a alternância casa a primeira que serve.
 */
const EXATOS = ['write18', ...RADICAIS];
const PADRAO_EXATO = new RegExp(`\\\\(${EXATOS.join('|')})(?![A-Za-z])`, 'i');

/**
 * Casamento por radical em qualquer posição do nome do comando. É o que pega
 * `\InputIfFileExists`, `\lstinputlisting`, `\verbatiminput` e `\@input`.
 */
const PADRAO_RADICAL = new RegExp(
  `\\\\[A-Za-z@]*(?:${RADICAIS.join('|')})[A-Za-z@]*`,
  'i',
);

/**
 * Primitivas de arquivo do expl3 (`\ior_open:Nn`, `\iow_new:N`) e o
 * `\begin{filecontents}`, que escreve arquivo sem usar `\` no nome do
 * ambiente.
 */
const PADRAO_EXTRA = /\\io[rw]_|\\begin\s*\{\s*filecontents/i;

/** Devolve o comando barrado encontrado, ou `null` se a fórmula está limpa. */
export function comandoBarrado(formula: string): string | null {
  const exato = PADRAO_EXATO.exec(formula);
  if (exato) return `\\${exato[1]}`;

  const radical = PADRAO_RADICAL.exec(formula);
  if (radical) return radical[0];

  const extra = PADRAO_EXTRA.exec(formula);
  return extra ? extra[0].trim() : null;
}
