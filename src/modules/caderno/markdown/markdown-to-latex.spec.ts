import * as fs from 'fs';
import * as path from 'path';
import { markdownToLatex } from './markdown-to-latex';

const opts = { resolveAsset: (key: string) => `assets/${key}.png` };

/** Só o LaTeX, para os casos em que assets e avisos não são o ponto. */
const tex = (md: string): string => markdownToLatex(md, opts).latex;

describe('markdownToLatex — contrato', () => {
  it('devolve vazio para entrada vazia, sem quebrar', () => {
    const r = markdownToLatex('', opts);
    expect(r.latex).toBe('');
    expect(r.assets).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('trata campo ausente como vazio, em vez de quebrar o caderno inteiro', () => {
    // O card 03 lê campos opcionais da questão (`textoAlternativaE` e afins).
    // Um `undefined` ali não pode derrubar a geração de 90 questões.
    const r = markdownToLatex(undefined as unknown as string, opts);
    expect(r.latex).toBe('');
    expect(r.avisos).toEqual([]);
  });

  it('é síncrono: não devolve Promise', () => {
    const r = markdownToLatex('texto', opts);
    expect(r).not.toBeInstanceOf(Promise);
    expect((r as unknown as { then?: unknown }).then).toBeUndefined();
    expect(r.latex).toBe('texto');
  });
});

describe('markdownToLatex — a armadilha do R$', () => {
  it('mantém $R$ como fórmula e escapa o R$ de dinheiro', () => {
    const r = markdownToLatex('A resistência $R$ custa R$ 12,00.', opts);
    expect(r.latex).toBe('A resistência $R$ custa R\\$ 12,00.');
  });

  it('não deixa dois valores em real engolirem a prosa entre eles', () => {
    // Sem o neutralizarReal, o remark-math casa os dois cifrões e o trecho
    // " 50,00 e outro R" vira inlineMath — a prosa some do parágrafo.
    const r = markdownToLatex('custa R$ 50,00 e outro R$ 30,00', opts);
    expect(r.latex).toBe('custa R\\$ 50,00 e outro R\\$ 30,00');
    expect(r.latex).toContain('e outro');
  });
});

describe('markdownToLatex — matemática', () => {
  it('converte $$...$$ de uma linha só em display \\[...\\]', () => {
    expect(tex('A integral $$\\int_0^1 x\\,dx$$ vale isso.')).toBe(
      'A integral \\[\\int_0^1 x\\,dx\\] vale isso.',
    );
  });

  it('mantém a fórmula inline entre cifrões, sem tocar no conteúdo', () => {
    expect(tex('vale $\\frac{1}{2}$ do total')).toBe(
      'vale $\\frac{1}{2}$ do total',
    );
  });

  it('ainda acha o display quando um R$ desloca os offsets antes dele', () => {
    // O guarda da segunda restrição de ordem do pipeline. `restaurarDisplay`
    // acha o `$$` pelo `position.start.offset` do nó, e esses offsets são
    // relativos à string NEUTRALIZADA. O marcador do `neutralizarReal` tem um
    // caractere a menos que `R$`, então passar o markdown original desloca
    // tudo que vem depois e o display vira inline — sem erro, sem aviso, só
    // um PDF pior. É preciso um `R$` ANTES da fórmula para o teste morder.
    const r = markdownToLatex(
      'A resistência custa R$ 12,00 e a energia é $$E = mc^2$$.',
      opts,
    );
    expect(r.latex).toBe(
      'A resistência custa R\\$ 12,00 e a energia é \\[E = mc^2\\].',
    );
    expect(r.avisos).toEqual([]);
  });
});

describe('markdownToLatex — HTML de alinhamento', () => {
  it('envolve os dois parágrafos num único ambiente center', () => {
    const md = [
      '<div style="text-align: center">',
      '',
      'primeiro',
      '',
      'segundo',
      '',
      '</div>',
    ].join('\n');

    const latex = tex(md);
    expect(latex.match(/\\begin\{center\}/g)).toHaveLength(1);
    expect(latex.match(/\\end\{center\}/g)).toHaveLength(1);
    expect(latex).toBe('\\begin{center}\nprimeiro\n\nsegundo\n\\end{center}');
  });
});

describe('markdownToLatex — assets', () => {
  it('acumula as keys na ordem de aparição, sem repetir', () => {
    const md = [
      '![](asset://b)',
      '',
      '![](asset://a)',
      '',
      '![](asset://b)',
    ].join('\n');

    expect(markdownToLatex(md, opts).assets).toEqual(['b', 'a']);
  });
});

const DIR_FIXTURES = path.join(__dirname, 'fixtures');

describe('markdownToLatex — fixtures', () => {
  const entradas = fs
    .readdirSync(DIR_FIXTURES)
    .filter((f) => f.endsWith('.md'))
    .sort();

  it('tem o conjunto completo de fixtures', () => {
    expect(entradas.length).toBeGreaterThanOrEqual(13);
  });

  it.each(entradas)('%s', (arquivo) => {
    const md = fs.readFileSync(path.join(DIR_FIXTURES, arquivo), 'utf8');
    const esperado = fs.readFileSync(
      path.join(DIR_FIXTURES, arquivo.replace(/\.md$/, '.tex')),
      'utf8',
    );

    // Única normalização: o `.tex` termina com a quebra de linha final que
    // todo arquivo de texto tem, e o conversor não emite trailing whitespace.
    expect(markdownToLatex(md, opts).latex).toBe(esperado.replace(/\n$/, ''));
  });
});
