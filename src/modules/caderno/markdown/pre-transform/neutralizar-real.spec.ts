import { MARCADOR_REAL, neutralizarReal } from './neutralizar-real';

const m = MARCADOR_REAL;

describe('neutralizarReal', () => {
  it('neutraliza R$ de dinheiro', () => {
    expect(neutralizarReal('custa R$ 50,00')).toBe(`custa ${m} 50,00`);
    expect(neutralizarReal('R$ 1.200 no mês')).toBe(`${m} 1.200 no mês`);
    expect(neutralizarReal('taxa de R$5')).toBe(`taxa de ${m}5`);
  });

  it('neutraliza os dois R$ do parágrafo, que é o caso que quebra', () => {
    // Sem isso, o remark-math casa os dois cifrões e o texto entre eles
    // vira inlineMath(" 50,00 e outro R").
    expect(neutralizarReal('custa R$ 50,00 e outro R$ 30,00')).toBe(
      `custa ${m} 50,00 e outro ${m} 30,00`,
    );
    // O remark-math não olha a letra, só os cifrões: o `r$` minúsculo
    // produzia o mesmo inlineMath espúrio.
    expect(neutralizarReal('custa r$ 50,00 e outro r$ 30,00')).toBe(
      `custa ${m} 50,00 e outro ${m} 30,00`,
    );
  });

  it('NÃO destrói $R$, que é fórmula legítima', () => {
    // R de raio, de resistência. A regra ingênua transformaria isto em
    // "O raio $ e o dobro", e o cifrão órfão quebraria a matemática do
    // resto do parágrafo.
    expect(neutralizarReal('O raio $R$ e o dobro.')).toBe(
      'O raio $R$ e o dobro.',
    );
    expect(neutralizarReal('Área $\\pi R^2$ com R$ 5 de taxa.')).toBe(
      `Área $\\pi R^2$ com ${m} 5 de taxa.`,
    );
    // r minúsculo também é variável comum (raio), e a âncora protege os dois.
    expect(neutralizarReal('o raio $r$ e o dobro.')).toBe(
      'o raio $r$ e o dobro.',
    );
  });

  it('preserva fórmula e dinheiro no mesmo parágrafo', () => {
    expect(neutralizarReal('A resistência $R$ custa R$ 12,00.')).toBe(
      `A resistência $R$ custa ${m} 12,00.`,
    );
  });

  it('não mexe em matemática comum nem em texto sem R$', () => {
    expect(neutralizarReal('A função $f(x)=x^2$ é par.')).toBe(
      'A função $f(x)=x^2$ é par.',
    );
    expect(neutralizarReal('')).toBe('');
  });
});
