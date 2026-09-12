import { escaparForaDaMatematica } from '../latex/escapar-fora-da-matematica';
import { ColetorDeImagens, emitirImagem, emitirMarcador } from './imagens';

/**
 * Um campo de texto de questão vira LaTeX.
 *
 * ```
 * texto cru
 *   → remove <div style="text-align:…">…</div>, mantendo o conteúdo
 *   → segmenta nos construtos de imagem
 *         imagem  →  \includegraphics[…]{assets/NN.ext}   (não escapa)
 *         texto   →  escaparForaDaMatematica(…)           (card 01)
 *   → junta
 * ```
 *
 * ⚠️ **A ordem não é arbitrária.** Escapar primeiro destrói `<img src="…">`:
 * `<`, `>` e `"` estão todos no mapa do `escapeLatex`. Substituir primeiro
 * insere `\includegraphics{…}`, cujos `\ { }` o escaper destruiria em seguida.
 * É o mesmo problema que o card 01 resolveu para matemática, e por isso a
 * mesma forma: segmentar, e delegar o resto.
 *
 * Parágrafos não precisam de tratamento: linha em branco no markdown já é
 * quebra de parágrafo em LaTeX, e `\n` simples já é espaço.
 */

/**
 * O par que o editor grava ao alinhar (`useRichTextEditor.ts:156-163`), sempre
 * no mesmo "part" e **nunca aninhado** — por isso o não-guloso casa certo com
 * vários no mesmo campo. `</div>` órfão fica literal, escapado, que é o
 * comportamento certo para HTML que não veio do nosso editor.
 */
const DIV_ALINHAMENTO = /<div style="text-align:[^"]*">([\s\S]*?)<\/div>/g;

/** `![alt](referencia)` — o construto sem dimensão. */
const IMG_MARKDOWN = /!\[[^\]]*\]\(([^)\s]+)\)/g;

/** `<img src="…" … />` — o construto com dimensão. */
const IMG_HTML = /<img\b[^>]*\/?>/g;
const SRC = /\bsrc="([^"]*)"/;
const WIDTH = /\bwidth="(\d+(?:\.\d+)?)"/;

export function textoParaLatex(
  texto: string | undefined,
  coletor: ColetorDeImagens,
  avisar: (mensagem: string) => void,
): string {
  if (!texto) return '';

  const semDiv = texto.replace(DIV_ALINHAMENTO, '$1');

  const saida: string[] = [];
  let ultimoFim = 0;

  const despejarTexto = (ate: number): void => {
    const trecho = semDiv.slice(ultimoFim, ate);
    if (trecho) saida.push(escaparForaDaMatematica(trecho));
  };

  for (const { inicio, fim, referencia, largura } of acharImagens(semDiv)) {
    despejarTexto(inicio);

    const resultado = coletor.registrar(referencia);
    if ('motivo' in resultado) {
      avisar(`imagem recusada: ${resultado.motivo}`);
      saida.push(emitirMarcador());
    } else {
      saida.push(emitirImagem(resultado.arquivo, largura));
    }

    ultimoFim = fim;
  }

  despejarTexto(semDiv.length);
  return saida.join('');
}

export interface OcorrenciaDeImagem {
  inicio: number;
  fim: number;
  referencia: string;
  largura?: number;
}

/**
 * Acha os dois construtos numa passada só, em ordem de posição.
 *
 * Os dois são varridos separadamente e depois ordenados porque uma regex única
 * com alternância ficaria ilegível e os grupos de captura se embaralhariam
 * entre os ramos.
 *
 * ⚠️ **Exportada porque o card 08 usa a mesma definição.** Se a migração e o
 * gerador discordarem do que é um construto de imagem, a migração deixa para
 * trás exatamente as URLs que o gerador continua encontrando — e a métrica de
 * sucesso do card 08 (zero `origem: 'url'`) nunca fecha.
 */
export function acharImagens(texto: string): OcorrenciaDeImagem[] {
  const achados: OcorrenciaDeImagem[] = [];

  for (const m of texto.matchAll(IMG_MARKDOWN)) {
    achados.push({
      inicio: m.index,
      fim: m.index + m[0].length,
      referencia: m[1],
    });
  }

  for (const m of texto.matchAll(IMG_HTML)) {
    const src = SRC.exec(m[0]);
    if (!src) continue;
    const width = WIDTH.exec(m[0]);
    achados.push({
      inicio: m.index,
      fim: m.index + m[0].length,
      referencia: src[1],
      largura: width ? Number(width[1]) : undefined,
    });
  }

  return achados.sort((a, b) => a.inicio - b.inicio);
}
