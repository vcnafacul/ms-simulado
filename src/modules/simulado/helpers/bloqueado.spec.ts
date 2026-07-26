import { atingiuQuantidade } from './bloqueado';

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
