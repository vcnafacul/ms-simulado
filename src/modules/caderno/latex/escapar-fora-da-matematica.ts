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
 * ⚠️ O critério é a PARIDADE das barras que vêm antes do `%`, não a presença
 * de uma barra. Um número ÍMPAR de barras significa que o `%` já está
 * escapado — a última barra pertence a ele. Um número PAR — incluindo
 * zero — significa que ele está cru: em `$a \\% b$` as duas barras formam
 * uma quebra de linha (`\\`), e o `%` depois dela nunca foi tocado. Um
 * lookbehind simples (`(?<!\\)%`) confundiria "precedido de barra" com
 * "escapado" e deixaria esse `%` passar cru.
 */
const escaparPorcentoEmMath = (trecho: string): string =>
  trecho.replace(/(\\*)%/g, (_, barras: string) =>
    barras.length % 2 === 0 ? `${barras}\\%` : `${barras}%`,
  );

interface Abertura {
  delim: string;
  fim: number; // índice onde começa o delimitador de fechamento
}

/**
 * Devolve onde abre e onde fecha a fórmula que começa na posição `i`, ou
 * `null` se ali o cifrão é texto.
 *
 * Quatro condições combinadas, e cada uma existe por um caso real:
 *
 * 1. **Não precedido de R/r.** `R$ 50` e `R$5` são dinheiro. A âncora olha o
 *    caractere ANTES do cifrão, e é por isso que `$R$` continua abrindo — ali
 *    o anterior é espaço, e o `R` é a variável dentro da fórmula.
 * 2. **Não seguido de espaço.** O editor grava `${fórmula}$`, sempre colado.
 *    Espaço depois do cifrão é dinheiro: `custa $ 50 e $ 30`.
 * 3. **Com fechamento adiante.** Impede um cifrão solto de abrir uma região
 *    que nunca fecha e engolir o escape de todo o resto do texto. O índice
 *    do fechamento (`fim`) é devolvido junto com a decisão de abrir — a
 *    invariante de terminação mora na mesma função que a consome, então
 *    quem chama nunca recalcula esse índice, e `i` sempre avança no laço.
 * 4. **Sem quebra de linha dentro do inline.** O editor grava fórmula inline
 *    casando `[^$\n]+?` (`useRichTextEditor.ts`, `preprocessLatex` do
 *    client) — ou seja, `$...$` nunca contém `\n`; `$$...$$` pode. Sem esta
 *    condição, `a) $5\nb) $10\nc) $x$` abriria a região falsa `$5\nb) $`:
 *    em math mode `\n` é só espaço, nada estoura, e a prova sai com as
 *    alternativas de preço em itálico matemático.
 *
 * A condição 1 e a 2 se complementam: sozinha, a 2 não pega `R$5`, e sozinha,
 * a 1 não pega `US$ 40`.
 */
function delimitadorQueAbre(texto: string, i: number): Abertura | null {
  if (texto[i] !== '$') return null;

  const delim = texto.startsWith('$$', i) ? '$$' : '$';

  const anterior = texto[i - 1];
  if (anterior === 'R' || anterior === 'r') return null;

  const seguinte = texto[i + delim.length];
  if (seguinte !== undefined && /\s/.test(seguinte)) return null;

  const fim = texto.indexOf(delim, i + delim.length);
  if (fim === -1) return null;

  if (delim === '$' && texto.slice(i + 1, fim).includes('\n')) return null;

  return { delim, fim };
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
    const abertura = delimitadorQueAbre(texto, i);

    if (abertura) {
      const { delim, fim } = abertura;
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
