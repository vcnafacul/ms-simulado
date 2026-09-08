import { Status } from '../../questao/enums/status.enum';
import { gerarCaderno, umaLinhaSo } from './gerar-caderno';
import { QuestaoParaCaderno, SimuladoParaCaderno } from './tipos';

const questao = (
  over: Partial<QuestaoParaCaderno> = {},
): QuestaoParaCaderno => ({
  status: Status.Approved,
  textoQuestao: 'Enunciado.',
  pergunta: 'Qual a resposta?',
  textoAlternativaA: 'alfa',
  textoAlternativaB: 'beta',
  textoAlternativaC: 'gama',
  textoAlternativaD: 'delta',
  textoAlternativaE: 'épsilon',
  ...over,
});

const simulado = (
  questoes: { questao: QuestaoParaCaderno; numero: number | null }[],
  over: Partial<SimuladoParaCaderno> = {},
): SimuladoParaCaderno => ({
  nome: 'Simulado de Teste',
  categoria: { nome: 'ENEM 1º dia', duracao: 300, quantidadeTotalQuestao: 5 },
  questoes,
  ...over,
});

describe('gerarCaderno — numeração', () => {
  it('imprime o número do relacionamento, não a posição', () => {
    // Os blocos 46..90 do ENEM precisam casar com o cartão-resposta. Renumerar
    // para 1..5 quebraria a correção.
    const r = gerarCaderno(
      simulado(
        [46, 47, 48, 49, 50].map((numero) => ({ questao: questao(), numero })),
      ),
      { draft: false },
    );
    expect(r.conteudo).toContain('\\setcounter{question}{45}');
    expect(r.conteudo).toContain('\\setcounter{question}{49}');
    expect(r.conteudo).not.toContain('\\setcounter{question}{0}');
    expect(r.questoesIncluidas).toEqual([46, 47, 48, 49, 50]);
  });

  it('emite um setcounter por questão, não só no primeiro', () => {
    // É o que faz um buraco de numeração não desalinhar todas as seguintes.
    const r = gerarCaderno(
      simulado([
        { questao: questao(), numero: 46 },
        { questao: questao(), numero: 51 },
      ]),
      { draft: false },
    );
    expect(r.conteudo.match(/\\setcounter\{question\}/g)).toHaveLength(2);
    expect(r.conteudo).toContain('\\setcounter{question}{50}');
  });

  it('reordena em vez de confiar na ordem de entrada', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: 'terceira' }), numero: 3 },
        { questao: questao({ textoQuestao: 'primeira' }), numero: 1 },
        { questao: questao({ textoQuestao: 'segunda' }), numero: 2 },
      ]),
      { draft: false },
    );
    expect(r.conteudo.indexOf('primeira')).toBeLessThan(
      r.conteudo.indexOf('segunda'),
    );
    expect(r.conteudo.indexOf('segunda')).toBeLessThan(
      r.conteudo.indexOf('terceira'),
    );
  });

  it('gera cinco blocos para cinco questões', () => {
    const r = gerarCaderno(
      simulado(
        [1, 2, 3, 4, 5].map((numero) => ({ questao: questao(), numero })),
      ),
      { draft: false },
    );
    expect(r.conteudo.match(/\\question/g)).toHaveLength(5);
    expect(r.conteudo.match(/\\begin\{choices\}/g)).toHaveLength(5);
  });
});

describe('gerarCaderno — o gabarito não viaja', () => {
  it('nunca emite CorrectChoice', () => {
    // \CorrectChoice renderiza IDÊNTICO a \choice sem a opção `answers`, então
    // o gabarito não apareceria no PDF — mas estaria em texto claro no
    // conteudo.tex, que vai para um projeto do Overleaf compartilhável por
    // link. O vazamento seria invisível justamente porque o PDF fica igual.
    const r = gerarCaderno(simulado([{ questao: questao(), numero: 1 }]), {
      draft: false,
    });
    expect(r.conteudo).not.toContain('CorrectChoice');
    expect(r.conteudo.match(/\\choice/g)).toHaveLength(5);
  });
});

describe('gerarCaderno — o ambiente questions', () => {
  it('não abre nem fecha questions: quem faz isso é o main.tex', () => {
    const r = gerarCaderno(simulado([{ questao: questao(), numero: 1 }]), {
      draft: false,
    });
    expect(r.conteudo).not.toContain('\\begin{questions}');
    expect(r.conteudo).not.toContain('\\end{questions}');
  });
});

describe('gerarCaderno — modo rascunho', () => {
  it('deixa de fora questão pendente e questão sem número', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: 'aprovada' }), numero: 1 },
        {
          questao: questao({
            status: Status.Pending,
            textoQuestao: 'pendente',
          }),
          numero: 2,
        },
        { questao: questao({ textoQuestao: 'sem numero' }), numero: null },
      ]),
      { draft: true },
    );
    expect(r.conteudo).toContain('aprovada');
    expect(r.conteudo).not.toContain('pendente');
    expect(r.conteudo).not.toContain('sem numero');
    expect(r.questoesIncluidas).toEqual([1]);
  });

  it('lista as faltantes até a quantidade da categoria', () => {
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 1 },
          { questao: questao(), numero: 3 },
        ],
        { categoria: { nome: 'c', duracao: 60, quantidadeTotalQuestao: 5 } },
      ),
      { draft: true },
    );
    expect(r.questoesFaltantes).toEqual([2, 4, 5]);
  });

  it('a faixa das faltantes não começa em 1 quando o bloco é 46..90', () => {
    // Simulado do 2º dia do ENEM. Varrer 1..quantidadeTotalQuestao reportaria
    // 1..45 como pendentes — todas erradas — e a caixa de pendências do
    // rascunho viraria ruído.
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 46 },
          { questao: questao({ status: Status.Pending }), numero: 47 },
          { questao: questao(), numero: 48 },
        ],
        {
          categoria: {
            nome: 'ENEM 2º dia',
            duracao: 300,
            quantidadeTotalQuestao: 3,
          },
        },
      ),
      { draft: true },
    );
    expect(r.questoesIncluidas).toEqual([46, 48]);
    expect(r.questoesFaltantes).toEqual([47]);
  });

  it('categoria custom, de quantidade livre, não tem faltantes', () => {
    // `quantidadeTotalQuestao: null` é categoria custom (etapa 3). Ver
    // `atingiuQuantidade` em simulado/helpers/bloqueado.ts.
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }], {
        categoria: { nome: 'c', duracao: 60, quantidadeTotalQuestao: null },
      }),
      { draft: true },
    );
    expect(r.questoesFaltantes).toEqual([]);
  });

  it('questão sem número fica de fora do modo normal, mas com aviso', () => {
    // `todasNumeradas` (simulado/helpers/bloqueado.ts) impede um simulado
    // assim de ser liberado, então chegar aqui é anomalia. Ela some da prova
    // de um jeito ou de outro — sumir CALADA é o que não pode.
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: 'numerada' }), numero: 1 },
        { questao: questao({ textoQuestao: 'sem numero' }), numero: null },
      ]),
      { draft: false },
    );
    expect(r.conteudo).not.toContain('sem numero');
    expect(r.avisos).toContain('uma questão sem número ficou de fora');
  });

  it('no modo normal não filtra nem lista faltantes', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: questao({
            status: Status.Pending,
            textoQuestao: 'pendente',
          }),
          numero: 1,
        },
      ]),
      { draft: false },
    );
    expect(r.conteudo).toContain('pendente');
    expect(r.questoesFaltantes).toEqual([]);
  });
});

describe('gerarCaderno — simulado sem questão elegível', () => {
  it('emite questão-marcador em vez de um questions vazio', () => {
    // `\begin{questions}\end{questions}` sem nenhum \question dispara
    // "Something's wrong--perhaps a missing \item" e a compilação PARA. Um zip
    // que não compila é o pior desfecho: a pessoa não recebe nada que dê para
    // consertar.
    const r = gerarCaderno(simulado([]), { draft: false });
    expect(r.conteudo).toContain('\\question');
    expect(r.conteudo).toContain('nenhuma questão elegível');
    expect(r.questoesIncluidas).toEqual([]);
    expect(r.avisos).toContain(
      'este simulado não tem nenhuma questão elegível para o caderno',
    );
  });

  it('também quando o rascunho filtra tudo', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ status: Status.Pending }), numero: 1 }]),
      { draft: true },
    );
    expect(r.conteudo).toContain('\\question');
    expect(r.conteudo).toContain('nenhuma questão elegível');
  });
});

describe('gerarCaderno — degradação', () => {
  it('alternativa vazia sai vazia e avisa', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ textoAlternativaC: '' }), numero: 47 }]),
      { draft: false },
    );
    expect(r.conteudo).toContain('\\choice{}');
    expect(r.avisos).toContain('questão 47 — alternativa C está em branco');
  });

  it('questão inteira vazia não quebra', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: {
            status: Status.Approved,
            textoQuestao: '',
            pergunta: '',
            textoAlternativaA: '',
            textoAlternativaB: '',
            textoAlternativaC: '',
            textoAlternativaD: '',
            textoAlternativaE: '',
          },
          numero: 12,
        },
      ]),
      { draft: false },
    );
    expect(r.conteudo).toContain('\\question');
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('markdown no campo sai literal, e isso é a premissa', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: questao({ textoQuestao: 'veja **isto** e 100% disso' }),
          numero: 1,
        },
      ]),
      { draft: false },
    );
    expect(r.conteudo).toContain('veja **isto** e 100\\% disso');
  });
});

describe('gerarCaderno — imagens', () => {
  it('coleta de todos os campos, com contador contínuo', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: questao({
            textoQuestao: '![](https://x.com/a.png)',
            textoAlternativaB: '![](asset://assets/b.jpeg)',
          }),
          numero: 1,
        },
      ]),
      { draft: false },
    );
    expect(r.imagens).toHaveLength(2);
    expect(r.imagens[0].arquivo).toBe('assets/01.png');
    expect(r.imagens[1].arquivo).toBe('assets/02.jpeg');
  });

  it('mesma imagem em duas questões vira um arquivo só', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: questao({ textoQuestao: '![](https://x.com/a.png)' }),
          numero: 1,
        },
        {
          questao: questao({ textoQuestao: '![](https://x.com/a.png)' }),
          numero: 2,
        },
      ]),
      { draft: false },
    );
    expect(r.imagens).toHaveLength(1);
  });
});

describe('gerarCaderno — metadados.tex', () => {
  it('escapa o nome do simulado', () => {
    // "Simulado 100% ENEM" sem escape apaga o resto da linha, e o título da
    // capa some sem nenhum erro de compilação.
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }], {
        nome: 'Simulado 100% ENEM',
      }),
      { draft: false },
    );
    expect(r.metadados).toContain('\\def\\cadernoTitulo{Simulado 100\\% ENEM}');
  });

  it('monta o subtítulo com categoria, contagem e duração', () => {
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 1 },
          { questao: questao(), numero: 2 },
        ],
        {
          categoria: {
            nome: 'ENEM 1º dia',
            duracao: 300,
            quantidadeTotalQuestao: 2,
          },
        },
      ),
      { draft: false },
    );
    // O separador é $\cdot$, não o `·` literal: o glifo depende do T1.
    expect(r.metadados).toContain(
      '\\def\\cadernoSubtitulo{ENEM 1º dia $\\cdot$ 2 questões $\\cdot$ 300 min}',
    );
  });

  it('escapa o nome da categoria também', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }], {
        categoria: {
          nome: 'Exatas & Naturais',
          duracao: 60,
          quantidadeTotalQuestao: 1,
        },
      }),
      { draft: false },
    );
    expect(r.metadados).toContain('Exatas \\& Naturais');
  });

  it('no modo normal, nada de rascunho', () => {
    const r = gerarCaderno(simulado([{ questao: questao(), numero: 1 }]), {
      draft: false,
    });
    expect(r.metadados).not.toContain('cadernoRascunho');
    expect(r.metadados).not.toContain('cadernoPendencias');
  });

  it('no rascunho, liga o newif e lista as pendências', () => {
    // ⚠️ \cadernoRascunho é um \newif declarado no preambulo.tex, NÃO um \def.
    // `\def\cadernoRascunho{true}` não liga a marca d'água e não dá erro — ela
    // simplesmente não aparece.
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 1 },
          { questao: questao(), numero: 3 },
        ],
        { categoria: { nome: 'c', duracao: 60, quantidadeTotalQuestao: 4 } },
      ),
      { draft: true },
    );
    expect(r.metadados).toContain('\\cadernoRascunhotrue');
    expect(r.metadados).not.toContain('\\def\\cadernoRascunho{');
    expect(r.metadados).toContain('\\def\\cadernoPendencias{2, 4}');
  });
});

describe('gerarCaderno — bloco de avisos', () => {
  it('vai no topo do conteudo.tex, um por linha', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ textoAlternativaC: '' }), numero: 47 }]),
      { draft: false },
    );
    expect(r.conteudo.startsWith('% AVISO:')).toBe(true);
    expect(r.conteudo).toContain(
      '% AVISO: questão 47 — alternativa C está em branco',
    );
  });

  it('sem aviso nenhum, não há bloco', () => {
    const r = gerarCaderno(simulado([{ questao: questao(), numero: 1 }]), {
      draft: false,
    });
    expect(r.conteudo).not.toContain('% AVISO:');
  });

  it('uma linha de comentário por aviso, sempre', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: questao({ textoAlternativaA: '', textoAlternativaC: '' }),
          numero: 1,
        },
      ]),
      { draft: false },
    );
    const linhasDeAviso = r.conteudo
      .split('\n')
      .filter((l) => l.startsWith('% AVISO:'));
    expect(linhasDeAviso).toHaveLength(r.avisos.length);
  });
});

describe('umaLinhaSo', () => {
  // ⚠️ Testado direto, e não através de `gerarCaderno`, porque HOJE nenhum
  // aviso carrega texto de questão — então um teste de ponta a ponta passaria
  // sem exercitar nada, e seria daqueles que dão a impressão de proteger.
  //
  // A proteção é para quando um aviso passar a embutir conteúdo (nome de
  // arquivo, trecho do enunciado). Uma quebra de linha ali ENCERRA o
  // comentário LaTeX e joga o resto do aviso dentro do documento, impresso na
  // prova do aluno.
  it('troca quebra de linha por espaço', () => {
    expect(umaLinhaSo('questão 3 —\nalternativa vazia')).toBe(
      'questão 3 — alternativa vazia',
    );
    expect(umaLinhaSo('a\r\nb')).toBe('a b');
    expect(umaLinhaSo('a\n\n\nb')).toBe('a b');
  });

  it('apara as pontas', () => {
    expect(umaLinhaSo('  texto  ')).toBe('texto');
  });
});
