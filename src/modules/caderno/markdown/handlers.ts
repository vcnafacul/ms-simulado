import { escapeLatex } from './escape-latex';
import { NO_ALINHADO } from './pre-transform/agrupar-html';
import { MARCADOR_REAL } from './pre-transform/neutralizar-real';
import { EH_DISPLAY } from './pre-transform/restaurar-display';
import { comandoBarrado } from './sanitizar-math';

export interface Contexto {
  /** key `asset://` → caminho relativo dentro do zip. */
  resolveAsset: (key: string) => string;
  /** Keys encontradas, na ordem de aparição. Preenchido durante a compilação. */
  assets: string[];
  /**
   * O que a pessoa precisa conferir na questão. Sem contexto de questão: quem
   * sabe o número é o card 03, e é ele que prefixa.
   */
  avisos: string[];
}

type Handler = (no: any, ctx: Contexto) => string;

/** Compila os filhos e junta com um separador. */
const filhos = (no: any, ctx: Contexto, sep = ''): string =>
  (no.children ?? []).map((f: any) => compilarNo(f, ctx)).join(sep);

/** Devolve o marcador do `neutralizarReal` ao texto original. */
const semMarcador = (texto: string, comoLatex: boolean): string =>
  texto.split(MARCADOR_REAL).join(comoLatex ? 'R\\$' : 'R$');

const HANDLERS: Record<string, Handler> = {
  root: (no, ctx) => filhos(no, ctx, '\n\n'),

  paragraph: (no, ctx) => filhos(no, ctx),

  text: (no) => semMarcador(escapeLatex(String(no.value ?? '')), true),

  strong: (no, ctx) => `\\textbf{${filhos(no, ctx)}}`,
  emphasis: (no, ctx) => `\\emph{${filhos(no, ctx)}}`,
  delete: (no, ctx) => `\\sout{${filhos(no, ctx)}}`,

  // O escape roda aqui, então o marcador volta como `R\$` igual ao texto.
  inlineCode: (no) =>
    `\\texttt{${semMarcador(escapeLatex(String(no.value ?? '')), true)}}`,

  // Rebaixado: o caderno já tem hierarquia própria (a numeração da questão).
  heading: (no, ctx) => `\\textbf{${filhos(no, ctx)}}\\par`,

  list: (no, ctx) => {
    const ambiente = no.ordered ? 'enumerate' : 'itemize';
    return `\\begin{${ambiente}}[nosep]\n${filhos(no, ctx, '\n')}\n\\end{${ambiente}}`;
  },

  listItem: (no, ctx) => `\\item ${filhos(no, ctx, '\n\n').trim()}`,

  blockquote: (no, ctx) =>
    `\\begin{quote}\n${filhos(no, ctx, '\n\n')}\n\\end{quote}`,

  // Caderno é papel: a URL não serve pra nada, e a maioria dos links do
  // acervo é ruído de colagem. Fica o texto.
  link: (no, ctx) => filhos(no, ctx),

  break: () => '\\\\\n',

  thematicBreak: () => '\\par\\noindent\\hrulefill\\par',

  code: (no) => {
    // Nada é escapado dentro do verbatim, então um \end{verbatim} no
    // conteúdo fecharia o ambiente no meio e o resto do caderno viraria
    // código. Quebrar a sequência resolve sem alterar o que se lê.
    //
    // ⚠️ O marcador do `neutralizarReal` volta como `R$` PURO aqui — dentro
    // de verbatim nada é escapado, então `R\$` sairia com a barra literal.
    const conteudo = semMarcador(String(no.value ?? ''), false).replace(
      /\\end\{verbatim\}/g,
      '\\end {verbatim}',
    );
    return `\\begin{verbatim}\n${conteudo}\n\\end{verbatim}`;
  },
};

const AMBIENTE_POR_ALINHAMENTO: Record<string, string | null> = {
  left: null, // padrão do documento: não gera ambiente
  center: 'center',
  right: 'flushright',
  justify: null,
};

/**
 * `align` do nó GFM → especificação de coluna do tabularx.
 *
 * ⚠️ Todas são `X`, nunca `l`/`c`/`r`. O `tabularx` **exige pelo menos uma
 * coluna X** — sem nenhuma ele aborta com "No suitable X-column found", e uma
 * tabela toda alinhada explicitamente não teria X nenhum. O prefixo
 * `>{...\arraybackslash}` dá o alinhamento sem abrir mão do X, então a tabela
 * preenche a `\linewidth` e quebra o texto das células.
 */
const COLUNA_POR_ALINHAMENTO: Record<string, string> = {
  left: '>{\\raggedright\\arraybackslash}X',
  center: '>{\\centering\\arraybackslash}X',
  right: '>{\\raggedleft\\arraybackslash}X',
};

/**
 * `<img ...>`, com ou sem os outros atributos, e os dois atributos que
 * interessam extraídos à parte.
 *
 * ⚠️ São três regex e não uma só de propósito. A forma "tudo numa" —
 * `<img[^>]*src=...[^>]*?(?:width=...)?[^>]*>` — **casa a tag mas nunca
 * captura o width**: com o grupo opcional depois de um quantificador lazy, o
 * motor acha um casamento válido pulando o grupo e não volta atrás pra
 * preencher captura. Medido contra a saída real do editor
 * (`serializeInlineContent` em `useRichTextEditor.ts`), que grava
 * `<img src="..." alt="..." width="320" height="240" />` — nessa ordem, com o
 * `alt` ENTRE o `src` e o `width`: o grupo dava `undefined` e a largura do
 * editor sumia em silêncio.
 */
const IMG_HTML = /<img\b[^>]*>/i;
const IMG_SRC = /\bsrc\s*=\s*["']([^"']+)["']/i;
const IMG_WIDTH = /\bwidth\s*=\s*["']?(\d+)/i;

/**
 * Dica de largura do editor (pixels CSS) → pontos TeX, ou `null` quando a
 * dica não dá para usar.
 *
 * 1px = 1/96", 1pt = 1/72" — fator 0,75. Sem converter, os 320px que o editor
 * grava viravam `320pt` (11,3 cm) contra os ~8 cm de coluna do template, e o
 * `max width=\linewidth` engolia toda dica acima de ~227px: a largura que o
 * autor viu no editor deixava de significar qualquer coisa.
 *
 * ⚠️ Devolver `null` (e cair no `[max width=\linewidth]` puro) é o caminho
 * certo para dica ilegível — nunca emitir a dica mesmo assim. Uma dica errada
 * é cosmética; um `width=NaNpt` ou `width=0pt` no `.tex` é caderno que não
 * compila ou imagem que some da prova. Hoje o `IMG_WIDTH` só captura dígitos,
 * então `NaN` não chega aqui pela tag HTML — mas a assinatura aceita `string`
 * e o `width="0"` do editor chega, sim, e produzia uma imagem de largura zero.
 */
function larguraEmPontos(largura?: string): number | null {
  if (!largura) return null;

  const pixels = Number(largura);
  if (!Number.isFinite(pixels) || pixels <= 0) return null;

  const pontos = Math.round(pixels * 0.75);
  return pontos > 0 ? pontos : null;
}

function imagem(url: string, ctx: Contexto, largura?: string): string {
  const key = url.replace(/^asset:\/\//, '');
  const caminho = ctx.resolveAsset(key);

  if (!caminho) {
    ctx.avisos.push(
      `imagem não encontrada (${key}) — saiu um marcador no lugar`,
    );
    return '\\textbf{[imagem indisponível]}';
  }

  // Defesa de quem emite o comando, não só de quem fornece o caminho: um `}`
  // no caminho fecha o grupo do \includegraphics cedo e o resto da questão
  // vira LaTeX solto. Espaço quebra o graphicx. O `resolveAsset` deveria
  // entregar caminho limpo (contrato da task seguinte), mas quem escreve o
  // `.tex` é este arquivo.
  if (/[{}\\%#$^~ ]/.test(caminho)) {
    ctx.avisos.push(
      `caminho de imagem inválido (${key}) — tem caractere que quebra o LaTeX; saiu um marcador no lugar`,
    );
    return '\\textbf{[imagem indisponível]}';
  }

  if (!ctx.assets.includes(key)) ctx.assets.push(key);

  // A largura do editor é sugestão, não imposição: o `max width` garante que
  // nunca estoure a coluna, que em duas colunas tem ~8 cm.
  const pontos = larguraEmPontos(largura);
  const opcoes =
    pontos === null
      ? '[max width=\\linewidth]'
      : `[max width=\\linewidth,width=${pontos}pt]`;

  return `\\includegraphics${opcoes}{${caminho}}`;
}

/**
 * Fórmula: conteúdo passa sem tocar, delimitador é normalizado.
 *
 * `\[…\]` em vez de `$$…$$` porque o `$$` passa por fora do tratamento de
 * display do amsmath — inclusive `\predisplaypenalty`/`\postdisplaypenalty`,
 * que são justamente os controles de quebra de página que importam na coluna
 * de ~8 cm do template do card 01.
 *
 * ⚠️ A checagem de display tem DUAS partes. `no.type === 'math'` é o display
 * genuíno (delimitadores em linha própria); a flag `EH_DISPLAY` é o display
 * que o `restaurarDisplay` recuperou do `$$...$$` de uma linha só. Olhar só a
 * flag perde o primeiro caso.
 *
 * E o mesmo booleano vai pro validador: `align`, `equation`, `gather` e
 * `\tag` só existem em display, e o editor valida `$$` com
 * `displayMode: true`. Fixar um valor aqui ou alargaria o inline em silêncio,
 * ou reprovaria fórmula que o editor aceita.
 */
function matematica(no: any, ctx: Contexto): string {
  const formula = String(no.value ?? '');

  // Fórmula vazia não é conteúdo, e emiti-la é ativo: `$` + `$` colados
  // formam `$$`, que em LaTeX ABRE matemática em display e engole a prosa
  // seguinte até o próximo `$$`. O editor salva nó latex com `formula: ''`
  // sem reclamar, então isto chega de verdade — e corromperia a questão em
  // silêncio, sem erro nenhum.
  if (!formula.trim()) {
    ctx.avisos.push(
      'fórmula vazia na questão — foi removida; confira se faltou conteúdo',
    );
    return '';
  }

  const ehDisplay = no.type === 'math' || no.data?.[EH_DISPLAY] === true;
  const barrado = comandoBarrado(formula, ehDisplay);

  if (barrado) {
    // Nunca some: quem for imprimir a prova precisa VER que há algo errado
    // ali, em vez de descobrir uma fórmula ausente na frente da turma.
    if (barrado.motivo === 'perigoso') {
      ctx.avisos.push(
        `fórmula bloqueada por conter ${barrado.comando}, que em LaTeX de ` +
          `verdade escapa da fórmula e pode ler arquivos da máquina de quem ` +
          `compilar — reescreva a fórmula sem esse comando`,
      );
      return `\\textbf{[fórmula bloqueada: ${escapeLatex(barrado.comando)}]}`;
    }

    ctx.avisos.push(`fórmula inválida: ${barrado.detalhe}`);
    return '\\textbf{[fórmula inválida]}';
  }

  return ehDisplay ? `\\[${formula}\\]` : `$${formula}$`;
}

Object.assign(HANDLERS, {
  table: (no: any, ctx: Contexto) => {
    // Coluna sem alinhamento declarado vira X puro: é ela que absorve a
    // largura e quebra o texto. Sem nenhum X o tabularx aborta.
    const colunas: string[] = (no.align ?? []).map(
      (a: string | null) => COLUNA_POR_ALINHAMENTO[a ?? ''] ?? 'X',
    );

    const [cabecalho, ...corpo]: any[] = no.children ?? [];
    const linha = (l: any) => `${compilarNo(l, ctx)} \\\\`;

    return [
      `\\begin{tabularx}{\\linewidth}{@{}${colunas.join('')}@{}}`,
      '\\toprule',
      cabecalho ? linha(cabecalho) : '',
      '\\midrule',
      ...corpo.map(linha),
      '\\bottomrule',
      '\\end{tabularx}',
    ]
      .filter((l) => l !== '')
      .join('\n');
  },

  tableRow: (no: any, ctx: Contexto) => filhos(no, ctx, ' & '),
  tableCell: (no: any, ctx: Contexto) => filhos(no, ctx),

  image: (no: any, ctx: Contexto) => imagem(String(no.url ?? ''), ctx),

  inlineMath: matematica,
  math: matematica,

  [NO_ALINHADO]: (no: any, ctx: Contexto) => {
    const ambiente = AMBIENTE_POR_ALINHAMENTO[no.align] ?? null;
    const dentro = filhos(no, ctx, '\n\n');
    return ambiente
      ? `\\begin{${ambiente}}\n${dentro}\n\\end{${ambiente}}`
      : dentro;
  },

  // HTML que sobrou solto: ou é tag que o `agruparHtml` não casou, ou é algo
  // fora do subset. A exceção é a imagem de uma linha só —
  // `<div style="text-align: center"><img ...></div>` ou o `<img>` cru — que
  // o `agruparHtml` deixa passar de propósito e chega aqui como um nó só.
  // Fora isso nunca vaza pro .tex: LaTeX não entende HTML.
  html: (no: any, ctx: Contexto) => {
    const bruto = String(no.value ?? '').trim();
    const tag = IMG_HTML.exec(bruto);
    const src = tag ? IMG_SRC.exec(tag[0]) : null;

    if (src) {
      const width = IMG_WIDTH.exec(tag![0]);
      return imagem(src[1], ctx, width?.[1]);
    }

    ctx.avisos.push(
      `HTML não suportado no conteúdo (${bruto.slice(0, 40)}) — foi descartado`,
    );
    return '';
  },
});

function compilarNo(no: any, ctx: Contexto): string {
  const handler = HANDLERS[no?.type];
  if (handler) return handler(no, ctx);

  // Nunca lança: uma construção exótica não pode derrubar um caderno de 90
  // questões. Emite o que dá pra ler e registra o que conferir.
  ctx.avisos.push(
    `construção não suportada (${no?.type}) — o conteúdo saiu como texto simples`,
  );
  return escapeLatex(textoCru(no));
}

/** Texto de qualquer nó, para o fallback. */
function textoCru(no: any, profundidade = 0): string {
  // Guarda de profundidade: `compilar` promete nunca lançar, e o card 03
  // conta com isso pra não perder um caderno inteiro por uma questão. Sem
  // ela, uma árvore com ciclo derruba tudo com RangeError em vez de
  // degradar. Não deveria acontecer com saída do remark — é cinto de
  // segurança, não caminho esperado.
  if (profundidade > 50) return '';
  if (typeof no?.value === 'string') return no.value;
  if (Array.isArray(no?.children)) {
    return no.children.map((f: any) => textoCru(f, profundidade + 1)).join('');
  }
  return '';
}

export function compilar(arvore: any, ctx: Contexto): string {
  return compilarNo(arvore, ctx);
}
