import { numerosDoResultado } from './resultado-do-cartao';

describe('numerosDoResultado (028 · 01)', () => {
  it('erros = marcadas e erradas; em branco = o resto; aproveitamento = acertos ÷ total', () => {
    expect(
      numerosDoResultado({ total: 90, acertos: 61, questoesRespondidas: 86 }),
    ).toEqual({
      total: 90,
      acertos: 61,
      erros: 25,
      emBranco: 4,
      aproveitamento: 68,
    });
  });

  it('dado torto não gera número negativo', () => {
    expect(
      numerosDoResultado({ total: 10, acertos: 12, questoesRespondidas: 5 }),
    ).toEqual({
      total: 10,
      acertos: 10,
      erros: 0,
      emBranco: 0,
      aproveitamento: 100,
    });
    expect(
      numerosDoResultado({ total: 0, acertos: 0, questoesRespondidas: 0 })
        .aproveitamento,
    ).toBe(0);
  });
});
