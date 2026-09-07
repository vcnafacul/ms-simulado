import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { compilar, Contexto } from './handlers';
import { MARCADOR_REAL } from './pre-transform/neutralizar-real';
import { EH_DISPLAY } from './pre-transform/restaurar-display';
import { NO_ALINHADO } from './pre-transform/agrupar-html';

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

  it('separa os parágrafos de um item de lista', () => {
    // Sem separador os dois viram uma palavra só: "primeirosegundo".
    expect(tex('- primeiro\n\n  segundo')).toContain('primeiro\n\nsegundo');
  });

  it('põe a lista aninhada em linha própria', () => {
    const saida = tex('- a\n  - b');
    expect(saida).toContain('\\item a\n\n\\begin{itemize}');
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

  it('não estoura a pilha com árvore circular', () => {
    // "nunca lança" é invariante da etapa, não aproximação: o card 03 conta
    // com ela pra não perder um caderno de 90 questões por causa de uma.
    const ctx = contexto();
    const circular: any = { type: 'circular', children: [] };
    circular.children.push(circular);

    expect(() => compilar(circular, ctx)).not.toThrow();
  });
});

describe('handlers — tabela', () => {
  it('traduz tabela GFM respeitando os alinhamentos', () => {
    const saida = tex(
      '| esq | centro | dir |\n|:---|:---:|---:|\n| a | b | c |',
    );
    expect(saida).toContain(
      '\\begin{tabularx}{\\linewidth}{@{}' +
        '>{\\raggedright\\arraybackslash}X' +
        '>{\\centering\\arraybackslash}X' +
        '>{\\raggedleft\\arraybackslash}X@{}}',
    );
    expect(saida).toContain('\\toprule');
    expect(saida).toContain('esq & centro & dir \\\\');
    expect(saida).toContain('\\midrule');
    expect(saida).toContain('a & b & c \\\\');
    expect(saida).toContain('\\bottomrule');
    expect(saida).toContain('\\end{tabularx}');
  });

  it('usa X puro para coluna sem alinhamento declarado', () => {
    const saida = tex('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(saida).toContain('{@{}XX@{}}');
  });

  it('sempre produz ao menos uma coluna X', () => {
    // O tabularx aborta com "No suitable X-column found" se nenhuma coluna
    // for X. Uma tabela toda alinhada explicitamente cairia nisso se o
    // alinhamento virasse l/c/r.
    const saida = tex('| a | b |\n|:---|---:|\n| 1 | 2 |');
    expect(saida).toMatch(/\\begin\{tabularx\}[^\n]*X/);
  });

  it('escapa o conteúdo das células', () => {
    expect(tex('| a |\n|---|\n| 50% |')).toContain('50\\%');
  });
});

describe('handlers — imagem', () => {
  it('traduz imagem markdown e registra o asset', () => {
    const ctx = contexto();
    const saida = tex('![alt](asset://abc)', ctx);
    expect(saida).toContain(
      '\\includegraphics[max width=\\linewidth]{assets/abc.png}',
    );
    expect(ctx.assets).toEqual(['abc']);
  });

  it('traduz imagem em HTML e respeita a largura do editor', () => {
    // Ordem de atributos igual à do `serializeInlineContent` do editor:
    // src, alt, width, height — o width NÃO vem logo depois do src.
    const ctx = contexto();
    const saida = tex(
      '<img src="asset://abc" alt="x" width="320" height="240" />',
      ctx,
    );
    expect(saida).toContain('{assets/abc.png}');
    expect(saida).toContain('max width=\\linewidth');
    expect(saida).toContain('width=320pt');
    expect(ctx.assets).toEqual(['abc']);
  });

  it('imagem HTML sem width usa só o max width', () => {
    expect(tex('<img src="asset://abc" alt="x" />')).toBe(
      '\\includegraphics[max width=\\linewidth]{assets/abc.png}',
    );
  });

  it('trata a imagem alinhada de uma linha só, que chega como um nó html', () => {
    const ctx = contexto();
    const saida = tex(
      '<div style="text-align: center"><img src="asset://abc" alt="x" width="320" height="240" /></div>',
      ctx,
    );
    expect(saida).toContain('{assets/abc.png}');
    expect(saida).toContain('width=320pt');
    expect(ctx.avisos).toEqual([]);
  });

  it('avisa e não some quando o asset é desconhecido', () => {
    const ctx: Contexto = { ...contexto(), resolveAsset: () => '' };
    const saida = tex('![](asset://sumida)', ctx);
    expect(saida).toContain('imagem indisponível');
    expect(ctx.avisos.join(' ')).toContain('sumida');
    expect(ctx.assets).toEqual([]);
  });
});

describe('handlers — matemática', () => {
  it('passa o conteúdo da fórmula sem tocar', () => {
    expect(tex('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
    expect(tex('$x^2 + y^2$')).toBe('$x^2 + y^2$');
  });

  it('emite \\[...\\] para nó math, que já é display por construção', () => {
    // Delimitador em linha própria: o remark-math produz nó `math`, sem
    // passar pelo `restaurarDisplay` — só a flag não bastaria.
    const arvore = parse('$$\n\\int_0^1 x\\,dx\n$$');
    expect(arvore.children[0].type).toBe('math');
    expect(compilar(arvore, contexto()).trim()).toBe('\\[\\int_0^1 x\\,dx\\]');
  });

  it('emite display quando o nó está marcado pelo restaurarDisplay', () => {
    const arvore = parse('$$b^2$$');
    const no = arvore.children[0].children[0];
    expect(no.type).toBe('inlineMath');
    no.data = { [EH_DISPLAY]: true };
    expect(compilar(arvore, contexto()).trim()).toBe('\\[b^2\\]');
  });

  it('barra comando perigoso e deixa visível, com aviso', () => {
    const ctx = contexto();
    const saida = tex('$\\gdef\\alpha{x}$', ctx);
    expect(saida).not.toContain('\\gdef');
    expect(saida).toContain('fórmula bloqueada');
    expect(ctx.avisos.join(' ')).toContain('\\gdef');
    expect(ctx.avisos.join(' ')).toContain('sem esse comando');
  });

  it('barra fórmula inválida com orientação diferente da do comando perigoso', () => {
    // `\input` não é "comando proibido" pro KaTeX, é sintaxe que ele não
    // entende — e o acionável é que ela já renderizava quebrada no editor.
    const ctx = contexto();
    const saida = tex('$\\input{/etc/passwd}$', ctx);
    expect(saida).not.toContain('/etc/passwd');
    expect(saida).toContain('fórmula inválida');
    expect(ctx.avisos.join(' ')).toContain('já aparecia quebrada no editor');
    expect(ctx.avisos.join(' ')).toContain('\\input');
  });

  it('aceita construção só-display em display e a reporta em inline', () => {
    // `align` só existe em display. Fixar displayMode aqui alargaria em
    // silêncio o que passa no caminho inline.
    const formula = '\\begin{align} a &= b \\end{align}';

    const arvoreDisplay = parse('$$x$$');
    arvoreDisplay.children[0].children[0].value = formula;
    arvoreDisplay.children[0].children[0].data = { [EH_DISPLAY]: true };
    const ctxDisplay = contexto();
    expect(compilar(arvoreDisplay, ctxDisplay).trim()).toBe(`\\[${formula}\\]`);
    expect(ctxDisplay.avisos).toEqual([]);

    const arvoreInline = parse('$x$');
    arvoreInline.children[0].children[0].value = formula;
    const ctxInline = contexto();
    expect(compilar(arvoreInline, ctxInline).trim()).toContain(
      'fórmula inválida',
    );
    expect(ctxInline.avisos.join(' ')).toContain('display mode');
  });
});

describe('handlers — alinhamento e HTML', () => {
  const alinhado = (align: string) => ({
    type: 'root',
    children: [
      {
        type: NO_ALINHADO,
        align,
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'meio' }] },
        ],
      },
    ],
  });

  it('traduz o nó agrupado para o ambiente certo', () => {
    expect(compilar(alinhado('center'), contexto()).trim()).toBe(
      '\\begin{center}\nmeio\n\\end{center}',
    );
    expect(compilar(alinhado('right'), contexto()).trim()).toBe(
      '\\begin{flushright}\nmeio\n\\end{flushright}',
    );
  });

  it('left não gera ambiente nenhum', () => {
    expect(compilar(alinhado('left'), contexto()).trim()).toBe('meio');
    expect(compilar(alinhado('justify'), contexto()).trim()).toBe('meio');
  });

  it('html solto vira aviso e não vaza pro .tex', () => {
    const ctx = contexto();
    const saida = tex('<div style="text-align: center">', ctx);
    expect(saida).not.toContain('<div');
    expect(saida).toBe('');
    expect(ctx.avisos.join(' ')).toContain('HTML');
  });
});
