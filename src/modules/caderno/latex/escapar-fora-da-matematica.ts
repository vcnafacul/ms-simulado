import { escapeLatex } from './escape-latex';

/**
 * Escapa o texto de uma questão para LaTeX, deixando a matemática intacta.
 *
 * Esta POC não converte markdown: o texto entra no molde literalmente. Mas não
 * pode entrar CRU — em LaTeX o `%` é comentário, e "100% dos casos" imprimiria
 * `100` com o resto da linha desaparecendo, sem erro e sem aviso.
 *
 * Fórmula é o oposto: `_`, `^`, `{`, `}`, `\` e `&` são sintaxe essencial
 * dentro dela, e escapá-los quebraria `x^2`, `\frac{1}{2}` e o `&` do
 * `\begin{align}`. Por isso o escape acontece só fora das regiões de
 * matemática, e esta função existe para achar essas regiões.
 *
 * Os delimitadores **não são tocados**: o trecho de fórmula atravessa inteiro,
 * com os `$`, e o LaTeX renderiza display sozinho.
 */

/**
 * Único caractere escapado dentro da fórmula: `%` é comentário em qualquer
 * modo, inclusive dentro de `$...$`.
 *
 * ⚠️ Só o que ainda não está escapado. `$50\%$` é fórmula plausível — uma
 * porcentagem dentro de conta — e escapar de novo faria `\%` virar `\\%`, que
 * é quebra de linha seguida de comentário.
 */
const escaparPorcentoEmMath = (trecho: string): string =>
  trecho.replace(/(?<!\\)%/g, '\\%');

/**
 * Devolve o delimitador que abre fórmula na posição `i`, ou `null` se ali o
 * cifrão é texto.
 *
 * Três condições combinadas, e cada uma existe por um caso real:
 *
 * 1. **Não precedido de R/r.** `R$ 50` e `R$5` são dinheiro. A âncora olha o
 *    caractere ANTES do cifrão, e é por isso que `$R$` continua abrindo — ali
 *    o anterior é espaço, e o `R` é a variável dentro da fórmula.
 * 2. **Não seguido de espaço.** O editor grava `${fórmula}$`, sempre colado.
 *    Espaço depois do cifrão é dinheiro: `custa $ 50 e $ 30`.
 * 3. **Com fechamento adiante.** Impede um cifrão solto de abrir uma região
 *    que nunca fecha e engolir o escape de todo o resto do texto.
 *
 * A condição 1 e a 2 se complementam: sozinha, a 2 não pega `R$5`, e sozinha,
 * a 1 não pega `US$ 40`.
 */
function delimitadorQueAbre(texto: string, i: number): string | null {
  if (texto[i] !== '$') return null;

  const delim = texto.startsWith('$$', i) ? '$$' : '$';

  const anterior = texto[i - 1];
  if (anterior === 'R' || anterior === 'r') return null;

  const seguinte = texto[i + delim.length];
  if (seguinte === undefined || /\s/.test(seguinte)) return null;

  if (texto.indexOf(delim, i + delim.length) === -1) return null;

  return delim;
}

export function escaparForaDaMatematica(texto: string): string {
  const saida: string[] = [];
  let textoPendente = '';
  let i = 0;

  // Acumula o texto comum e só escapa ao fechar a corrida, para o escaper
  // rodar uma vez por trecho em vez de uma vez por caractere.
  const despejarTexto = (): void => {
    if (textoPendente) {
      saida.push(escapeLatex(textoPendente));
      textoPendente = '';
    }
  };

  while (i < texto.length) {
    const delim = delimitadorQueAbre(texto, i);

    if (delim) {
      const fim = texto.indexOf(delim, i + delim.length);
      despejarTexto();
      saida.push(escaparPorcentoEmMath(texto.slice(i, fim + delim.length)));
      i = fim + delim.length;
      continue;
    }

    textoPendente += texto[i];
    i += 1;
  }

  despejarTexto();
  return saida.join('');
}
