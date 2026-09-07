import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { compilar, Contexto } from './handlers';
import { MARCADOR_REAL } from './pre-transform/neutralizar-real';

const parse = (md: string): any =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(md);

function contexto(): Contexto {
  return {
    resolveAsset: (key: string) => `assets/${key}.png`,
    assets: [],
    avisos: [],
  };
}

/** Compila sem pré-transformação — os handlers isolados. */
function tex(md: string, ctx: Contexto = contexto()): string {
  return compilar(parse(md), ctx).trim();
}

describe('handlers — texto e marcas', () => {
  it('escapa o texto do parágrafo', () => {
    expect(tex('100% dos casos & mais')).toBe('100\\% dos casos \\& mais');
  });

  it('traduz negrito, itálico, tachado e código inline', () => {
    expect(tex('**forte**')).toBe('\\textbf{forte}');
    expect(tex('*enfase*')).toBe('\\emph{enfase}');
    expect(tex('~~fora~~')).toBe('\\sout{fora}');
    expect(tex('`codigo`')).toBe('\\texttt{codigo}');
  });

  it('escapa dentro das marcas também', () => {
    expect(tex('**100%**')).toBe('\\textbf{100\\%}');
  });

  it('devolve o marcador do neutralizarReal como R\\$ no texto', () => {
    const arvore = parse('custa X 50');
    arvore.children[0].children[0].value = `custa ${MARCADOR_REAL} 50`;
    expect(compilar(arvore, contexto()).trim()).toBe('custa R\\$ 50');
  });
});

describe('handlers — blocos', () => {
  it('rebaixa heading para negrito, porque o caderno tem hierarquia própria', () => {
    expect(tex('# Titulo')).toBe('\\textbf{Titulo}\\par');
    expect(tex('###### Menor')).toBe('\\textbf{Menor}\\par');
  });

  it('traduz lista não ordenada', () => {
    expect(tex('- um\n- dois')).toBe(
      '\\begin{itemize}[nosep]\n\\item um\n\\item dois\n\\end{itemize}',
    );
  });

  it('traduz lista ordenada', () => {
    expect(tex('1. um\n2. dois')).toBe(
      '\\begin{enumerate}[nosep]\n\\item um\n\\item dois\n\\end{enumerate}',
    );
  });

  it('traduz citação', () => {
    expect(tex('> citado')).toBe('\\begin{quote}\ncitado\n\\end{quote}');
  });

  it('separa parágrafos com linha em branco', () => {
    expect(tex('um\n\ndois')).toBe('um\n\ndois');
  });

  it('traduz quebra de linha forçada', () => {
    expect(tex('um  \ndois')).toBe('um\\\\\ndois');
  });

  it('traduz régua horizontal', () => {
    expect(tex('---')).toBe('\\par\\noindent\\hrulefill\\par');
  });

  it('mantém o texto do link e descarta a URL', () => {
    // Caderno é papel: URL clicável não serve pra nada, e a maioria dos
    // links do acervo é ruído de colagem.
    expect(tex('veja [o site](https://exemplo.com)')).toBe('veja o site');
  });
});

describe('handlers — bloco de código', () => {
  it('usa verbatim', () => {
    expect(tex('```\nx = 1\n```')).toBe(
      '\\begin{verbatim}\nx = 1\n\\end{verbatim}',
    );
  });

  it('neutraliza \\end{verbatim} dentro do bloco', () => {
    // Nada é escapado dentro do verbatim, então um \end{verbatim} no
    // conteúdo fecharia o ambiente no meio e o resto do caderno viraria
    // código.
    const saida = tex('```\nantes\n\\end{verbatim}\ndepois\n```');
    expect(saida.match(/\\end\{verbatim\}/g)).toHaveLength(1);
    expect(saida).toContain('antes');
    expect(saida).toContain('depois');
  });

  it('devolve o marcador como R$ puro dentro do verbatim', () => {
    // O neutralizarReal roda antes do parser e não distingue prosa de
    // código. Dentro de verbatim nada é escapado, então tem que voltar
    // `R$` e não `R\$` — senão sai a barra literal no PDF.
    const arvore = parse('```\ncusta X 50\n```');
    arvore.children[0].value = `custa ${MARCADOR_REAL} 50`;
    expect(compilar(arvore, contexto())).toContain('custa R$ 50');
  });
});

describe('handlers — degradação', () => {
  it('nó desconhecido vira texto e gera aviso, sem lançar', () => {
    const ctx = contexto();
    const arvore = parse('texto');
    arvore.children.push({
      type: 'construcaoInventada',
      value: 'seja o que for',
    });

    expect(() => compilar(arvore, ctx)).not.toThrow();
    expect(ctx.avisos).toHaveLength(1);
    expect(ctx.avisos[0]).toContain('construcaoInventada');
  });

  it('árvore vazia devolve string vazia', () => {
    expect(tex('')).toBe('');
  });
});
