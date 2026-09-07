import * as fs from 'fs';
import * as path from 'path';
import nestCli from '../../../nest-cli.json';

/**
 * Contrato de layout de origem do template do caderno, mais a metade de
 * empacotamento no fim do arquivo.
 *
 * Sob ts-jest, `__dirname` aponta pra árvore `src`, então os testes que leem
 * `TEMPLATE_DIR` passam do mesmo jeito com ou sem o `nest-cli.json` copiando
 * estes arquivos pra `dist` — eles travam só o layout dentro de
 * `src/modules/caderno/`: o mesmo caminho que o CadernoService (card 05) vai
 * usar — `path.join(__dirname, 'templates/padrao/v1')`. Quem trava a metade
 * de empacotamento do contrato é o último teste da suite: ele lê os globs
 * declarados em `nest-cli.json` (não roda `nest build` nem inspeciona
 * `dist/`) e confere que cobrem toda extensão presente no diretório do
 * template. O que de fato acaba no pacote publicado — via `nest build` e o
 * `COPY dist ./` do `ms.dockerfile` — fica fora desta suite.
 */
const TEMPLATE_DIR = path.join(__dirname, 'templates/padrao/v1');

/**
 * Os arquivos copiados verbatim do diretório do template pro zip. Não é a
 * lista completa do zip: faltam metadados.tex e conteudo.tex (gerados),
 * assets/*, logo.png e manifest.json (copiados de outros lugares pelo card
 * 05). O `exemplo/` do template também não entra.
 */
const ARQUIVOS_COPIADOS_DO_TEMPLATE = [
  'main.tex',
  'preambulo.tex',
  'LEIA-ME.txt',
];

const ler = (arquivo: string): string =>
  fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');

describe('template do caderno (padrao/v1)', () => {
  it.each(ARQUIVOS_COPIADOS_DO_TEMPLATE)(
    '%s existe e não está vazio',
    (arquivo) => {
      expect(ler(arquivo).trim().length).toBeGreaterThan(0);
    },
  );

  it('main.tex usa a exam.cls em duas colunas', () => {
    expect(ler('main.tex')).toContain(
      '\\documentclass[11pt,a4paper,twocolumn]{exam}',
    );
  });

  it('main.tex encaixa preambulo, metadados e conteudo nessa ordem', () => {
    const main = ler('main.tex');
    const posicoes = ['preambulo', 'metadados', 'conteudo'].map((nome) =>
      main.indexOf(`\\input{${nome}}`),
    );
    expect(posicoes.every((i) => i >= 0)).toBe(true);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it('preambulo carrega ulem com [normalem]', () => {
    // Sem normalem o ulem sequestra o \emph e sublinha todo itálico — e o
    // conversor (card 02) mapeia ênfase para \emph. Falha silenciosa: só
    // aparece olhando o PDF.
    expect(ler('preambulo.tex')).toContain('\\usepackage[normalem]{ulem}');
  });

  it('preambulo não carrega o pacote fancyhdr, que conflita com a exam.cls', () => {
    // Asserção sobre `{fancyhdr}` e não sobre a palavra solta: o comentário do
    // preâmbulo cita o pacote de propósito, pra dizer qual não usar. A chave
    // pega tanto `\usepackage{fancyhdr}` quanto `\usepackage[opt]{fancyhdr}`.
    expect(ler('preambulo.tex')).not.toContain('{fancyhdr}');
  });

  it('todo macro do caderno usado no main.tex está definido no preambulo.tex', () => {
    // Sem compilador, esta é a checagem mais valiosa que resta: main.tex e
    // preambulo.tex são arquivos separados, e renomear um macro num deles
    // quebra o outro sem que nada acuse.
    //
    // A busca é por limite de nome (\macro não seguido de letra), não por
    // substring: senão renomear \capaCaderno para \capaCadernoAmpliada só no
    // preambulo passaria no teste com o main.tex já quebrado — e é justamente
    // esse o rename que a variante `ampliada` vai querer fazer.
    const preambulo = ler('preambulo.tex');
    const usadosNoMain = new Set(
      ler('main.tex').match(
        /\\(?:if)?caderno[A-Za-z]*|\\capaCaderno[A-Za-z]*/g,
      ) ?? [],
    );

    expect(usadosNoMain.size).toBeGreaterThan(0);
    usadosNoMain.forEach((macro) => {
      const nome = macro.slice(1);
      expect(preambulo).toMatch(new RegExp(`\\\\${nome}(?![A-Za-z])`));
    });
  });

  it('o \\input{conteudo} fica dentro do ambiente questions', () => {
    // \question fora de {questions} é erro duro da exam.cls, e o conteudo.tex
    // gerado é só uma sequência de \question — quem abre o ambiente é o main.
    expect(ler('main.tex')).toMatch(
      /\\begin\{questions\}[\s\S]*\\input\{conteudo\}[\s\S]*\\end\{questions\}/,
    );
  });

  it('o LEIA-ME cita o mesmo \\documentclass que o main.tex declara', () => {
    const declarado = ler('main.tex').match(/^\\documentclass.*$/m)?.[0];
    expect(declarado).toBeDefined();

    const leiaMe = ler('LEIA-ME.txt');
    expect(leiaMe).toContain(declarado as string);

    // A variante do gabarito também é copiada em prosa, no comentário do
    // main.tex e no LEIA-ME. Sem fixar as duas, mudar as opções da classe
    // deixa instruções de copiar-e-colar que não batem com o arquivo.
    const comGabarito = (declarado as string).replace(']', ',answers]');
    expect(ler('main.tex')).toContain(comGabarito);
    expect(leiaMe).toContain(comGabarito);
  });

  it('nest-cli.json copia o template pro dist', () => {
    // A outra metade do contrato. O spec acima roda sobre `src/` e passaria
    // mesmo que nada fosse empacotado; o ms.dockerfile faz `COPY dist ./`, e
    // sem estes globs a imagem sobe sem template — falha só em runtime, no
    // container. O exclude mantém o exemplo/ (fixture de validação manual)
    // fora do pacote.
    const assets = nestCli.compilerOptions.assets;

    const doCaderno = assets.filter((a) =>
      a.include.startsWith('modules/caderno/templates'),
    );
    expect(doCaderno.length).toBeGreaterThan(0);
    expect(doCaderno.every((a) => a.exclude?.includes('exemplo'))).toBe(true);

    // O exclude protege um caminho real e não-vazio: sem esta âncora, batizar
    // o fixture de `amostra/` tornaria o exclude um no-op, e um exemplo/ vazio
    // não provaria nada. O que importa é existir ali um arquivo cuja extensão
    // os globs pegariam.
    const noExemplo = fs.readdirSync(path.join(TEMPLATE_DIR, 'exemplo'), {
      withFileTypes: true,
    });
    expect(
      noExemplo.some(
        (entrada) =>
          entrada.isFile() &&
          doCaderno.some((a) =>
            a.include.endsWith(`*${path.extname(entrada.name)}`),
          ),
      ),
    ).toBe(true);

    // Assere o efeito, não a grafia: toda extensão que existe no diretório do
    // template precisa estar coberta por um glob. Sem isso, o próximo arquivo
    // adicionado aqui (um .sty, uma exam.cls vendorizada) reproduz este mesmo
    // bug com o teste verde.
    const extensoes = new Set(
      fs
        .readdirSync(TEMPLATE_DIR, { withFileTypes: true })
        .filter((entrada) => entrada.isFile())
        .map((entrada) => path.extname(entrada.name))
        .filter((ext) => ext !== ''),
    );
    expect(extensoes.size).toBeGreaterThan(0);
    extensoes.forEach((ext) =>
      expect(doCaderno.some((a) => a.include.endsWith(`*${ext}`))).toBe(true),
    );
  });
});
