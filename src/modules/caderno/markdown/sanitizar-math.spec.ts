import { comandoBarrado, katexTemParseInterno } from './sanitizar-math';

describe('comandoBarrado', () => {
  describe('ataques que a versão em lista de bloqueio não sustentava', () => {
    it('barra \\input direto', () => {
      expect(comandoBarrado('\\input{/etc/passwd}')).not.toBeNull();
    });

    it('barra \\InputIfFileExists (kernel do LaTeX2e, alias de \\input)', () => {
      expect(
        comandoBarrado('\\InputIfFileExists{/etc/passwd}{}{}'),
      ).not.toBeNull();
    });

    it('barra \\pdffiledump (primitiva pdfTeX, sem radical proibido nenhum)', () => {
      expect(
        comandoBarrado('\\pdffiledump{0}{4096}{/etc/passwd}'),
      ).not.toBeNull();
    });

    it('barra \\directlua (LuaTeX, execução arbitrária)', () => {
      expect(
        comandoBarrado('\\directlua{os.execute("cat /etc/passwd")}'),
      ).not.toBeNull();
    });

    it('barra \\write18 (shell escape)', () => {
      expect(comandoBarrado('\\write18{cat /etc/passwd}')).not.toBeNull();
    });

    it('barra ^^5cinput, que não contém uma barra invertida sequer', () => {
      // Prova por que a lista de bloqueio não sustentava: `^^5c` é a
      // notação de caractere do TeX e vira `\` antes da tokenização —
      // qualquer padrão ancorado em `\\` (regex ou não) é cego pra isso. O
      // KaTeX rejeita mesmo assim, só que por um motivo incidental (não
      // entende `^^` como escape) — o resultado final é o que importa:
      // REJEITADO.
      expect(comandoBarrado('^^5cinput{/etc/passwd}')).not.toBeNull();
    });

    it('barra \\lstinputlisting (listings, lê e mostra arquivo)', () => {
      expect(comandoBarrado('\\lstinputlisting{/etc/passwd}')).not.toBeNull();
    });

    it('barra \\special (primitiva de baixo nível, dependente do driver)', () => {
      expect(comandoBarrado('\\special{/etc/passwd}')).not.toBeNull();
    });

    it('barra \\csname construindo \\input em runtime', () => {
      expect(
        comandoBarrado('\\csname input\\endcsname{/etc/passwd}'),
      ).not.toBeNull();
    });

    it('barra \\tex_input:D, sintaxe expl3 (LaTeX3, oficial desde 2020)', () => {
      // `_` não é letra, então nenhum "radical em qualquer posição do
      // nome" da versão anterior alcançava isto — o radical `input` está
      // lá dentro (`tex_input`), mas fora do alcance de `[A-Za-z@]*`. O
      // KaTeX nem entende a sintaxe `:D` e rejeita o `\tex` sozinho como
      // comando desconhecido.
      expect(comandoBarrado('\\tex_input:D{/etc/passwd}')).not.toBeNull();
    });

    it('barra \\scantokens envolvendo \\input', () => {
      expect(
        comandoBarrado('\\scantokens{\\input{/etc/passwd}}'),
      ).not.toBeNull();
    });
  });

  describe('exceção explícita: comandos que o KaTeX aceita mas fazem I/O em LaTeX real', () => {
    it('barra \\includegraphics', () => {
      // O KaTeX entende \includegraphics — mas por padrão (trust: false)
      // só troca o comando por um indicador de "não suportado" na árvore
      // de renderização; não lança erro. O texto cru que vira o .tex não
      // passa por essa troca e carregaria o comando intacto, embutindo
      // qualquer arquivo do disco de quem compila.
      expect(
        comandoBarrado('\\includegraphics{/home/v/segredo.pdf}'),
      ).not.toBeNull();
    });

    it('barra \\href (cria link real em LaTeX, o KaTeX só mostra "não suportado")', () => {
      expect(
        comandoBarrado('\\href{file:///etc/passwd}{clique aqui}'),
      ).not.toBeNull();
    });

    it('barra \\url (mesmo mecanismo de \\href)', () => {
      expect(comandoBarrado('\\url{http://evil.example/exfil}')).not.toBeNull();
    });

    it('não confunde símbolo legítimo que contém "url" como substring', () => {
      // A lista de exceção é ancorada (\\url seguido de não-letra), não
      // "radical em qualquer posição" — essa foi a lição da rodada
      // anterior. \curlyeqprec e \preccurlyeq contêm "url" no meio do
      // nome e são símbolos matemáticos reais, sem nenhuma relação com
      // \url.
      expect(comandoBarrado('\\curlyeqprec')).toBeNull();
      expect(comandoBarrado('\\preccurlyeq')).toBeNull();
    });
  });

  describe('família de definição de macro: o KaTeX carrega o corpo sem validar', () => {
    // \gdef\textbf#1{\input{/etc/passwd}} passava: o KaTeX reconhece a
    // FORMA "defina um macro" mas guarda o corpo como tokens crus, sem
    // nunca analisá-lo -- a validação do corpo só aconteceria no uso do
    // macro, que nunca ocorre dentro do __parse. Em TeX de verdade \gdef é
    // global: escapa do $...$ e reescreve \textbf (ou \alpha, ou qualquer
    // nome) pro resto do documento, inclusive pra outra questão do mesmo
    // caderno -- cada __parse nosso é isolado, sem macro compartilhado, e
    // por isso o KaTeX nunca vê o par definição+uso. O pdflatex vê.
    it.each([
      '\\def',
      '\\gdef',
      '\\edef',
      '\\xdef',
      '\\global',
      '\\let',
      '\\futurelet',
      '\\newcommand',
      '\\renewcommand',
      '\\providecommand',
    ])(
      'barra %s sozinho, pelo nome, antes de tentar entender o resto',
      (comando) => {
        expect(comandoBarrado(`${comando}\\foo{bar}`)).not.toBeNull();
      },
    );

    it('barra o vetor que o review encontrou: \\gdef reescrevendo \\textbf com \\input', () => {
      expect(
        comandoBarrado('\\gdef\\textbf#1{\\input{/etc/passwd}}'),
      ).not.toBeNull();
    });

    it('barra a variante em duas questões: \\global\\let\\alpha\\input', () => {
      // Sozinho, isto redefine \alpha (símbolo grego, totalmente comum)
      // pra apontar pra \input. Uma segunda questão usando só "\alpha" de
      // forma inocente herdaria o \input depois que o pdflatex processasse
      // as duas em sequência no mesmo documento.
      expect(comandoBarrado('\\global\\let\\alpha\\input')).not.toBeNull();
    });

    it('barra \\renewcommand redefinindo um comando real com \\input dentro', () => {
      expect(
        comandoBarrado('\\renewcommand{\\textbf}[1]{\\input{/etc/passwd}}'),
      ).not.toBeNull();
    });

    it('barra \\gdef cujo corpo tenta chegar em \\input via \\csname', () => {
      expect(
        comandoBarrado(
          '\\gdef\\textbf#1{\\csname href\\endcsname{/etc/passwd}{x}}',
        ),
      ).not.toBeNull();
    });
  });

  describe('displayMode: o editor passa, o sanitizador tem que espelhar', () => {
    // \begin{align}, \begin{equation}, \begin{gather} e \tag só existem em
    // modo display -- e $$...$$ (que ativa displayMode: true no editor) é
    // o formato comum de resposta de física/química em várias linhas.
    // Fixar displayMode: true aqui alargaria em silêncio o que se aceita
    // no caminho inline; por isso o parâmetro.
    const formulasDeDisplay = [
      '\\begin{align} a &= b \\\\ c &= d \\end{align}',
      '\\begin{equation} x \\end{equation}',
      '\\begin{gather} x \\end{gather}',
      'x = 1 \\tag{2}',
    ];

    it.each(formulasDeDisplay)(
      'passa "%s" quando ehDisplay=true (equivalente a $$...$$ no editor)',
      (formula) => {
        expect(comandoBarrado(formula, true)).toBeNull();
      },
    );

    it.each(formulasDeDisplay)(
      'continua barrando "%s" quando ehDisplay=false (comportamento correto do KaTeX, não um bug)',
      (formula) => {
        expect(comandoBarrado(formula, false)).not.toBeNull();
      },
    );

    it('o default de ehDisplay é false, para não quebrar chamador que ainda não repassa o parâmetro', () => {
      expect(
        comandoBarrado('\\begin{equation} x \\end{equation}'),
      ).not.toBeNull();
    });
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
    // aqui não tira nada que funcionava; só confirma o mesmo veredito, e o
    // motivo devolvido diz exatamente isso.
    const resultado = comandoBarrado('\\frac{1}');
    expect(resultado).not.toBeNull();
    expect(resultado).toMatchObject({ motivo: 'invalido' });
    if (resultado?.motivo === 'invalido') {
      expect(resultado.detalhe).toContain('já aparecia quebrada no editor');
    }
  });

  it('discrimina o motivo: comando perigoso identificado por nome', () => {
    // \input em si cai no ParseError do KaTeX ("invalido") -- o KaTeX nem
    // conhece o comando. "perigoso" é reservado pra o que a gente sabe que
    // é ruim por nome: família de definição e a exceção do KaTeX.
    const resultado = comandoBarrado('\\gdef\\foo{bar}');
    expect(resultado).toEqual({ motivo: 'perigoso', comando: '\\gdef' });
  });

  it('discrimina o motivo: fórmula desconhecida pelo KaTeX é "invalido", não "perigoso"', () => {
    const resultado = comandoBarrado('\\input{/etc/passwd}');
    expect(resultado).toMatchObject({ motivo: 'invalido' });
  });
});

describe('katexTemParseInterno (guard da API privada __parse)', () => {
  it('confirma que a versão instalada do katex ainda expõe __parse', () => {
    // Sentinela de regressão: se isto virar false, o `throw` no
    // carregamento do módulo (logo abaixo do import) já vai ter disparado
    // antes mesmo deste teste rodar -- mas o teste documenta a garantia e
    // falha de um jeito legível se a checagem em si quebrar.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const katex = require('katex');
    expect(katexTemParseInterno(katex)).toBe(true);
  });

  it('detecta a ausência de __parse (simulando uma atualização do katex que o remova)', () => {
    expect(katexTemParseInterno({})).toBe(false);
    expect(katexTemParseInterno({ __parse: 'não é função' })).toBe(false);
  });
});
