import { comandoBarrado } from './sanitizar-math';

describe('comandoBarrado', () => {
  it('barra comandos que leem ou escrevem arquivo', () => {
    expect(comandoBarrado('\\input{/etc/passwd}')).toBe('\\input');
    expect(comandoBarrado('\\include{segredo}')).toBe('\\include');
    expect(comandoBarrado('\\openin1=/tmp/x')).toBe('\\openin');
    expect(comandoBarrado('\\read1 to \\linha')).toBe('\\read');
  });

  it('barra escrita e manipulação de catcode', () => {
    expect(comandoBarrado('\\write18{rm -rf /}')).toBe('\\write18');
    expect(comandoBarrado('\\write1{x}')).toBe('\\write');
    expect(comandoBarrado('\\catcode`\\@=11')).toBe('\\catcode');
    expect(comandoBarrado('\\csname input\\endcsname')).toBe('\\csname');
  });

  it('deixa passar fórmula legítima', () => {
    expect(comandoBarrado('\\frac{1}{2}')).toBeNull();
    expect(comandoBarrado('\\int_0^1 x\\,dx')).toBe(null);
    expect(comandoBarrado('x^2 + y^2 = z^2')).toBeNull();
    expect(comandoBarrado('\\alpha \\beta \\gamma')).toBeNull();
    expect(comandoBarrado('')).toBeNull();
  });

  it('barra a família inteira, não só a grafia exata', () => {
    // A primeira versão casava só o início do nome e deixava passar estes.
    // \InputIfFileExists e filecontents sao kernel do LaTeX2e: estao sempre
    // disponiveis, sem pacote nenhum.
    expect(comandoBarrado('\\InputIfFileExists{/etc/passwd}{}{}')).toContain(
      'InputIfFileExists',
    );
    expect(comandoBarrado('\\makeatletter\\@input{/etc/passwd}')).toContain(
      'input',
    );
    expect(comandoBarrado('\\lstinputlisting{/etc/passwd}')).toContain(
      'lstinputlisting',
    );
    expect(comandoBarrado('\\verbatiminput{/etc/passwd}')).toContain(
      'verbatiminput',
    );
    expect(
      comandoBarrado('\\begin{filecontents}{mau.tex}x\\end{filecontents}'),
    ).not.toBeNull();
    expect(
      comandoBarrado('\\ior_open:Nn \\g_tmp {/etc/passwd}'),
    ).not.toBeNull();
    expect(comandoBarrado('\\IfFileExists{/etc/passwd}{s}{n}')).toBeNull();
  });

  it('o padrão mais largo não pega fórmula legítima', () => {
    for (const f of [
      '\\frac{1}{2}',
      '\\int_0^1 x\\,dx',
      '\\sum_{i=1}^{n} i^2',
      '\\sqrt[3]{27}',
      '\\begin{matrix} a & b \\\\ c & d \\end{matrix}',
      '\\alpha \\beta \\Gamma \\Delta',
      '\\overline{AB} \\perp \\overrightarrow{CD}',
      '\\text{velocidade} = \\frac{\\Delta s}{\\Delta t}',
    ]) {
      expect(comandoBarrado(f)).toBeNull();
    }
  });
});
