import * as fs from 'fs';
import * as path from 'path';

/**
 * Contrato de empacotamento do template do caderno.
 *
 * O caminho aqui é o mesmo que o card 04 vai usar para montar o zip:
 * `path.join(__dirname, 'templates/v1')` a partir de `src/modules/caderno/`.
 *
 * O `ms.dockerfile` faz `COPY dist ./` e mais nada. Template que não chega no
 * `dist` não existe em produção, e a falha só aparece em runtime, dentro do
 * container — nunca em build. Como este card não tem código de runtime, este
 * spec é a única verificação automatizável que ele tem.
 */
const TEMPLATE_DIR = path.join(__dirname, 'templates/v1');

/** Os quatro arquivos que viajam no zip do usuário. */
const ARQUIVOS_DO_ZIP = [
  'main.tex',
  'preambulo.tex',
  'logo.png',
  'LEIA-ME.txt',
];

const lerTexto = (arquivo: string): string =>
  fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');

describe('template do caderno (v1)', () => {
  it.each(ARQUIVOS_DO_ZIP)('%s existe e não está vazio', (arquivo) => {
    const tamanho = fs.statSync(path.join(TEMPLATE_DIR, arquivo)).size;
    expect(tamanho).toBeGreaterThan(0);
  });

  it('main.tex usa a exam.cls em duas colunas', () => {
    expect(lerTexto('main.tex')).toContain(
      '\\documentclass[11pt,a4paper,twocolumn]{exam}',
    );
  });

  it('preambulo carrega ulem com [normalem]', () => {
    // Sem [normalem] o ulem sequestra o \emph e sublinha todo itálico. É
    // falha silenciosa: não dá erro, só aparece olhando o PDF.
    expect(lerTexto('preambulo.tex')).toContain('\\usepackage[normalem]{ulem}');
  });

  it('o exemplo existe e tem os dois arquivos', () => {
    // O `exclude` do nest-cli protege este diretório. Se ele sumir, o exclude
    // passa a guardar um caminho que não existe e ninguém percebe.
    const noExemplo = fs.readdirSync(path.join(TEMPLATE_DIR, 'exemplo'));
    expect(noExemplo).toEqual(
      expect.arrayContaining(['conteudo.tex', 'metadados.tex']),
    );
  });

  it('o nest-cli copia o template pro dist e deixa o exemplo de fora', () => {
    // Lido em runtime, não importado. Um `import` de arquivo fora de `src/`
    // puxa o JSON pro module graph do TypeScript e desloca o `rootDir`
    // inferido: o `dist/main.js` muda de lugar e o PM2 sobe com "Script not
    // found". Já aconteceu neste repo.
    const nestCli = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../nest-cli.json'), 'utf-8'),
    ) as {
      compilerOptions: { assets: { include: string; exclude?: string }[] };
    };

    const doCaderno = nestCli.compilerOptions.assets.filter((a) =>
      a.include.startsWith('modules/caderno/templates'),
    );
    expect(doCaderno.length).toBeGreaterThan(0);
    expect(doCaderno.every((a) => a.exclude?.includes('exemplo'))).toBe(true);

    // Assere o efeito, não a grafia: toda extensão do nível de topo do
    // template precisa estar coberta por um glob. Sem isto, o próximo arquivo
    // posto ali — um `.sty`, uma `exam.cls` vendorizada — some do `dist` com o
    // teste verde, e o defeito só aparece dentro do container.
    //
    // Nível de topo e não recursivo, de propósito: é exatamente o conjunto que
    // viaja no zip. O `exemplo/` está fora por decisão.
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
