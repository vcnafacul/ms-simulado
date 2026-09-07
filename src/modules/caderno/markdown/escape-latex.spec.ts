import { escapeLatex } from './escape-latex';

describe('escapeLatex', () => {
  it('escapa os caracteres especiais do LaTeX', () => {
    expect(escapeLatex('R$ 50,00')).toBe('R\\$ 50,00');
    expect(escapeLatex('100% dos casos')).toBe('100\\% dos casos');
    expect(escapeLatex('a_b')).toBe('a\\_b');
    expect(escapeLatex('#hashtag')).toBe('\\#hashtag');
    expect(escapeLatex('C&A')).toBe('C\\&A');
    expect(escapeLatex('{chaves}')).toBe('\\{chaves\\}');
  });

  it('escapa os quatro que o escape-latex não cobre', () => {
    // Sem estes, com fontes T1/OT1 o `a < b` renderiza como `a ¡ b`.
    expect(escapeLatex('a < b')).toBe('a \\textless{} b');
    expect(escapeLatex('a > b')).toBe('a \\textgreater{} b');
    expect(escapeLatex('a | b')).toBe('a \\textbar{} b');
    expect(escapeLatex('til ~ aqui')).toBe('til \\textasciitilde{} aqui');
    expect(escapeLatex('chapeu ^ aqui')).toBe(
      'chapeu \\textasciicircum{} aqui',
    );
  });

  it('não reescapa o que ele mesmo acabou de inserir', () => {
    // A armadilha: num escape em várias passadas, a barra vira
    // \textbackslash{} e a passada seguinte escapa as chaves DELE,
    // produzindo \textbackslash\{\}. Tem que ser passada única.
    expect(escapeLatex('a\\b')).toBe('a\\textbackslash{}b');
    expect(escapeLatex('\\')).toBe('\\textbackslash{}');
  });

  it('devolve string vazia intacta e não mexe em texto comum', () => {
    expect(escapeLatex('')).toBe('');
    expect(escapeLatex('texto sem nada especial')).toBe(
      'texto sem nada especial',
    );
  });
});
