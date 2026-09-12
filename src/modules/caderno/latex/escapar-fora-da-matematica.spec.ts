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
    // Gêmea da fixture acima, mas com o `r` minúsculo: sem ela, a condição 1
    // podia perder o ramo minúsculo e nenhum teste morreria — a regra do
    // espaço já rejeitaria `r$ 9,90` sozinha.
    expect(escaparForaDaMatematica('taxa de r$5 e r$3')).toBe(
      'taxa de r\\$5 e r\\$3',
    );
  });

  it('não abre quando o cifrão vem seguido de espaço', () => {
    // O editor nunca grava `$ fórmula $`. Espaço depois do cifrão é dinheiro.
    expect(escaparForaDaMatematica('custa $ 50 e $ 30')).toBe(
      'custa \\$ 50 e \\$ 30',
    );
    expect(escaparForaDaMatematica('US$ 40')).toBe('US\\$ 40');
    // A condição usa `\s`, não um espaço literal: tab também é "seguido de
    // espaço em branco" e também é dinheiro.
    expect(escaparForaDaMatematica('custa $\t50 e $x$')).toBe(
      'custa \\$\t50 e $x$',
    );
  });

  it('recusa fórmula escrita com espaço dentro dos delimitadores', () => {
    // NÃO é um caso de conteúdo colado à mão fora do editor: o
    // `EditorToolbar.tsx` chama `prompt("Digite a fórmula LaTeX:", ...)` e
    // passa o resultado direto para `insertLatex`, sem `.trim()`. Quem cola
    // " x^2 " com espaços no prompt grava `$ x^2 $` pelo caminho normal do
    // editor. O comportamento continua aceitável — sai escapado, portanto
    // visível — porque abrir região com espaço arriscaria demais para o
    // ganho, mas o motivo é esse, não "conteúdo fora do editor".
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

  it('conta a paridade das barras, não a presença', () => {
    // `\\` é quebra de linha; o `%` depois dela está CRU e precisa escapar.
    expect(escaparForaDaMatematica('$a \\\\% b$')).toBe('$a \\\\\\% b$');
  });
});

describe('escaparForaDaMatematica — quebra de linha dentro do inline', () => {
  it('não deixa cifrão solto engolir alternativas de linhas diferentes', () => {
    // `$5\nb) $` seria uma região de matemática plausível para o scanner, e em
    // math mode a quebra de linha vira só um espaço — nada estoura, a prova
    // sai com as alternativas em itálico. O editor nunca gera inline com
    // quebra de linha, então recusar é espelhar o produtor.
    expect(escaparForaDaMatematica('a) $5\nb) $10\nc) $x$')).toBe(
      'a) \\$5\nb) \\$10\nc) $x$',
    );
  });

  it('display $$ continua aceitando quebra de linha', () => {
    // A restrição é só do inline: o produtor gera display multi-linha.
    const entrada = '$$\\begin{aligned}\na &= b\n\\end{aligned}$$';
    expect(escaparForaDaMatematica(entrada)).toBe(entrada);
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
  it('cifrão solto ainda abre região falsa quando tudo cabe numa linha', () => {
    // O problema NÃO é prefixo de moeda: aqui não há nenhum. É um cifrão de
    // dinheiro com outro cifrão adiante na mesma linha. Fechar isto exigiria
    // heurística inventada — limite de tamanho, lista de moedas — e o
    // espelhamento do produtor já foi até onde dá para justificar.
    expect(escaparForaDaMatematica('US$40 e US$50')).toBe('US$40 e US$50');
    expect(escaparForaDaMatematica('Custa $50 e o item_2 pesa $x$ kg')).toBe(
      'Custa $50 e o item_2 pesa $x\\$ kg',
    );
  });
});
