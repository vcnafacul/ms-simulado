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

  it('não confunde comando barrado com prefixo de outro', () => {
    // \inputs e \reader não existem, mas se existissem não seriam \input
    // nem \read. O limite de nome do LaTeX é o primeiro não-letra.
    expect(comandoBarrado('\\inputs{x}')).toBeNull();
    expect(comandoBarrado('\\reader')).toBeNull();
    expect(comandoBarrado('\\writes')).toBeNull();
  });
});
