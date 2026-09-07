import { escapeLatex } from './escape-latex';
import { MARCADOR_REAL } from './pre-transform/neutralizar-real';

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

  listItem: (no, ctx) => `\\item ${filhos(no, ctx).trim()}`,

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
function textoCru(no: any): string {
  if (typeof no?.value === 'string') return no.value;
  if (Array.isArray(no?.children)) return no.children.map(textoCru).join('');
  return '';
}

export function compilar(arvore: any, ctx: Contexto): string {
  return compilarNo(arvore, ctx);
}
