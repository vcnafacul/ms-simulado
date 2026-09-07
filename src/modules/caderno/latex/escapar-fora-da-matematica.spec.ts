import { escaparForaDaMatematica } from './escapar-fora-da-matematica';

describe('escaparForaDaMatematica — o que abre fórmula', () => {
  it('deixa a matemática do editor intacta', () => {
    // O editor grava `${fórmula}$` e `$${fórmula}$$`, sempre numa linha.
    expect(escaparForaDaMatematica('$x^2$')).toBe('$x^2$');
    expect(escaparForaDaMatematica('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
    expect(escaparForaDaMatematica('$$\\int_0^1 x\\,dx$$')).toBe(
      '$$\\int_0^1 x\\,dx$$',
    );
  });

  it('abre em $R$, que é fórmula legítima', () => {
    // R de raio, de resistência. A âncora olha o caractere ANTES do cifrão,
    // e aqui é espaço — por isso `$R$` sobrevive enquanto `R$` não abre.
    expect(escaparForaDaMatematica('o raio $R$ e o dobro')).toBe(
      'o raio $R$ e o dobro',
    );
  });
});

describe('escaparForaDaMatematica — o que NÃO abre fórmula', () => {
  it('não abre depois de R ou r: é dinheiro', () => {
    expect(escaparForaDaMatematica('custa R$ 12,00')).toBe('custa R\\$ 12,00');
    // Sem a âncora, os dois cifrões abririam uma fórmula com a prosa dentro.
    expect(escaparForaDaMatematica('custa R$ 50,00 e outro R$ 30,00')).toBe(
      'custa R\\$ 50,00 e outro R\\$ 30,00',
    );
    // A regra do espaço não pegaria este: o cifrão vem colado no dígito.
    expect(escaparForaDaMatematica('taxa de R$5 e R$3')).toBe(
      'taxa de R\\$5 e R\\$3',
    );
    expect(escaparForaDaMatematica('custa r$ 9,90')).toBe('custa r\\$ 9,90');
  });

  it('não abre quando o cifrão vem seguido de espaço', () => {
    // O editor nunca grava `$ fórmula $`. Espaço depois do cifrão é dinheiro.
    expect(escaparForaDaMatematica('custa $ 50 e $ 30')).toBe(
      'custa \\$ 50 e \\$ 30',
    );
    expect(escaparForaDaMatematica('US$ 40')).toBe('US\\$ 40');
  });

  it('recusa fórmula escrita com espaço dentro dos delimitadores', () => {
    // Falso negativo ACEITO, não bug: o editor nunca grava assim, mas
    // conteúdo colado à mão pode. Sai como texto escapado — visível, e
    // portanto corrigível por quem imprime.
    expect(escaparForaDaMatematica('$ x^2 $')).toBe(
      '\\$ x\\textasciicircum{}2 \\$',
    );
  });

  it('não abre sem fechamento adiante', () => {
    // É o que impede um cifrão solto de engolir o escape de todo o resto.
    expect(escaparForaDaMatematica('custa $ 50')).toBe('custa \\$ 50');
    expect(escaparForaDaMatematica('valor em $')).toBe('valor em \\$');
    expect(escaparForaDaMatematica('$abc')).toBe('\\$abc');
  });
});

describe('escaparForaDaMatematica — o % dentro da fórmula', () => {
  it('escapa o % cru, porque é comentário em qualquer modo', () => {
    expect(escaparForaDaMatematica('$50% off$')).toBe('$50\\% off$');
  });

  it('não toca no % que já vem escapado', () => {
    // `$50\%$` é fórmula plausível. Escapar de novo faria `\%` virar `\\%`,
    // que é quebra de linha seguida de comentário.
    expect(escaparForaDaMatematica('$50\\%$')).toBe('$50\\%$');
  });

  it('escapa o % do texto normalmente', () => {
    expect(escaparForaDaMatematica('50% de $x$')).toBe('50\\% de $x$');
  });
});

describe('escaparForaDaMatematica — bordas', () => {
  it('string vazia devolve vazia', () => {
    expect(escaparForaDaMatematica('')).toBe('');
  });

  it('texto sem cifrão nenhum atravessa como o escaper puro', () => {
    expect(escaparForaDaMatematica('100% dos casos & mais')).toBe(
      '100\\% dos casos \\& mais',
    );
  });

  it('$$ sozinho vira dois cifrões visíveis', () => {
    // Fórmula inline vazia. Não abre por falta de fechamento, e o defeito
    // fica visível — que é o que se quer nesta POC.
    expect(escaparForaDaMatematica('$$')).toBe('\\$\\$');
  });

  it('$$$$ é display vazio e atravessa intacto', () => {
    expect(escaparForaDaMatematica('$$$$')).toBe('$$$$');
  });

  it('$a$$b$ vira duas fórmulas', () => {
    // O scanner é ganancioso da esquerda. Caso patológico, decidido em vez
    // de emergente.
    expect(escaparForaDaMatematica('$a$$b$')).toBe('$a$$b$');
  });

  it('a frase completa, com os três comportamentos juntos', () => {
    expect(
      escaparForaDaMatematica(
        'A resistência $R$ custa R$ 12,00 e a energia é $$E = mc^2$$.',
      ),
    ).toBe('A resistência $R$ custa R\\$ 12,00 e a energia é $$E = mc^2$$.');
  });
});

describe('escaparForaDaMatematica — limitação conhecida', () => {
  it('erra em US$40 seguido de outro cifrão', () => {
    // A âncora é só no R. Fechar isto significaria listar prefixos de moeda,
    // e a lista nunca acaba. Registrado como limitação, não como bug oculto:
    // se aparecer no acervo, vira ticket com um caso real na mão.
    expect(escaparForaDaMatematica('US$40 e US$50')).toBe('US$40 e US$50');
  });
});
