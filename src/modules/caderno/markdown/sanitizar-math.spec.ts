import { comandoBarrado } from './sanitizar-math';

describe('comandoBarrado', () => {
  it('barra os ataques medidos contra a versão em lista de bloqueio', () => {
    expect(comandoBarrado('\\input{/etc/passwd}')).not.toBeNull();
    expect(
      comandoBarrado('\\InputIfFileExists{/etc/passwd}{}{}'),
    ).not.toBeNull();
    expect(
      comandoBarrado('\\pdffiledump{0}{4096}{/etc/passwd}'),
    ).not.toBeNull();
    expect(
      comandoBarrado('\\directlua{os.execute("cat /etc/passwd")}'),
    ).not.toBeNull();
    expect(comandoBarrado('\\write18{cat /etc/passwd}')).not.toBeNull();

    // Prova por que a lista de bloqueio não sustentava: não há uma barra
    // invertida sequer nesta string. `^^5c` é a notação de caractere do TeX
    // e vira `\` antes da tokenização — qualquer padrão ancorado em `\\`
    // (regex ou não) é cego para isso. O KaTeX rejeita mesmo assim, só que
    // por um motivo incidental (não entende `^^` como escape) — o resultado
    // final é o que importa: REJEITADO.
    expect(comandoBarrado('^^5cinput{/etc/passwd}')).not.toBeNull();

    expect(comandoBarrado('\\lstinputlisting{/etc/passwd}')).not.toBeNull();
    expect(comandoBarrado('\\special{/etc/passwd}')).not.toBeNull();
    expect(
      comandoBarrado('\\csname input\\endcsname{/etc/passwd}'),
    ).not.toBeNull();

    // Segunda prova estrutural: expl3 (sintaxe `nome:args` com `_` e `:`) é
    // o formato oficial do LaTeX desde 2020. `_` não é letra, então nenhum
    // "radical em qualquer posição do nome" da versão anterior alcançava
    // isto — o radical `input` está lá dentro (`tex_input`), mas fora do
    // alcance de `[A-Za-z@]*`. O KaTeX nem entende a sintaxe `:D` e rejeita
    // o `\tex` sozinho como comando desconhecido.
    expect(comandoBarrado('\\tex_input:D{/etc/passwd}')).not.toBeNull();

    expect(comandoBarrado('\\scantokens{\\input{/etc/passwd}}')).not.toBeNull();
  });

  it('barra a exceção explícita que o KaTeX aceita', () => {
    // O KaTeX entende \includegraphics — mas por padrão (trust: false) só
    // troca o comando por um indicador de "não suportado" na árvore de
    // renderização; não lança erro. O texto cru que vira o .tex não passa
    // por essa troca e carregaria o comando intacto, embutindo qualquer
    // arquivo do disco de quem compila. Por isso a exceção explícita, e não
    // "aceitar porque o KaTeX aceitou".
    expect(
      comandoBarrado('\\includegraphics{/home/v/segredo.pdf}'),
    ).not.toBeNull();
  });

  it('deixa passar fórmula legítima', () => {
    const legitimas = [
      '\\frac{1}{2}',
      '\\int_0^1 x\\,dx',
      '\\sum_{i=1}^{n} i^2',
      '\\sqrt[3]{27}',
      '\\begin{matrix} a & b \\\\ c & d \\end{matrix}',
      '\\alpha \\beta \\Gamma \\Delta',
      '\\overline{AB} \\perp \\overrightarrow{CD}',
      '\\text{velocidade} = \\frac{\\Delta s}{\\Delta t}',
      'x^2 + y^2 = z^2',
      '\\binom{n}{k}',
    ];
    for (const formula of legitimas) {
      expect(comandoBarrado(formula)).toBeNull();
    }
  });

  it('trata fórmula vazia como segura', () => {
    expect(comandoBarrado('')).toBeNull();
  });

  it('barra fórmula inválida mas inofensiva, porque já estava quebrada no editor', () => {
    // \frac{1} sem o segundo argumento nunca renderizou no editor -- o
    // KaTeX já rejeitava no preview de quem cadastrou a questão. Barrar
    // aqui não tira nada que funcionava; só confirma o mesmo veredito.
    expect(comandoBarrado('\\frac{1}')).not.toBeNull();
  });
});
