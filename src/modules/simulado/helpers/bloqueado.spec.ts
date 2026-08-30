import { atingiuQuantidade, todasComNumero } from './bloqueado';

describe('todasComNumero', () => {
  it('retorna true quando todas as questões têm número', () => {
    expect(
      todasComNumero([{ numero: 1 }, { numero: 2 }, { numero: 3 }] as any),
    ).toBe(true);
  });

  it('retorna false quando alguma questão está sem número (null)', () => {
    expect(todasComNumero([{ numero: 1 }, { numero: null }] as any)).toBe(
      false,
    );
  });

  it('retorna false quando alguma questão está sem número (undefined)', () => {
    expect(todasComNumero([{ numero: 1 }, {}] as any)).toBe(false);
  });

  it('trata número 0 como número válido (não confundir com falsy)', () => {
    expect(todasComNumero([{ numero: 0 }] as any)).toBe(true);
  });

  it('retorna true para container vazio (nada pendente de numeração)', () => {
    expect(todasComNumero([] as any)).toBe(true);
  });
});

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
