import { atingiuQuantidade, todasNumeradas } from './bloqueado';

describe('atingiuQuantidade', () => {
  it('retorna true quando a categoria é livre (null)', () => {
    expect(atingiuQuantidade(null, 0)).toBe(true);
    expect(atingiuQuantidade(null, 42)).toBe(true);
  });

  it('retorna true quando o total bate com o alvo numérico', () => {
    expect(atingiuQuantidade(30, 30)).toBe(true);
  });

  it('retorna false quando o total não bate com o alvo numérico', () => {
    expect(atingiuQuantidade(30, 29)).toBe(false);
    expect(atingiuQuantidade(30, 31)).toBe(false);
  });
});

describe('todasNumeradas', () => {
  it('retorna true quando todas as entries tem numero', () => {
    expect(
      todasNumeradas([{ numero: 1 }, { numero: 2 }, { numero: 3 }]),
    ).toBe(true);
  });

  it('retorna false quando alguma entry tem numero null', () => {
    expect(todasNumeradas([{ numero: 1 }, { numero: null }])).toBe(false);
  });

  it('retorna false quando alguma entry tem numero undefined', () => {
    expect(todasNumeradas([{ numero: 1 }, { numero: undefined as any }])).toBe(
      false,
    );
  });

  it('retorna true pra lista vazia (nada a numerar)', () => {
    expect(todasNumeradas([])).toBe(true);
  });
});
