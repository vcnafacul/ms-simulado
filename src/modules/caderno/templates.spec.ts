import * as fs from 'fs';
import * as path from 'path';
import {
  ARQUIVOS_DO_REPO,
  ARQUIVOS_DO_TEMPLATE,
  TEMPLATE_DIR,
} from './templates';

const lerTexto = (arquivo: string): string =>
  fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');

describe('template do caderno (v1)', () => {
  // ⚠️ Este teste mudou de sentido no card 11. Antes era "os quatro arquivos
  // que o zip leva existem"; agora o zip lê os dois `.tex` da versão publicada
  // no Mongo. Os quatro seguem aqui por motivos diferentes: os de layout como
  // semente do `seed:template-caderno` e cópia de resgate, os do repo porque o
  // zip ainda os lê daqui. Sumir qualquer um continua sendo defeito.
  it.each([...ARQUIVOS_DO_TEMPLATE, ...ARQUIVOS_DO_REPO])(
    '%s existe e não está vazio',
    (arquivo) => {
      const tamanho = fs.statSync(path.join(TEMPLATE_DIR, arquivo)).size;
      expect(tamanho).toBeGreaterThan(0);
    },
  );

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

  it('o nest-cli copia toda extensão do template pro dist', () => {
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

    // Assere o efeito, não a grafia: toda extensão do nível de topo do
    // template precisa estar coberta por um glob. Sem isto, o próximo arquivo
    // posto ali — um `.sty`, uma `exam.cls` vendorizada — some do `dist` com o
    // teste verde, e o defeito só aparece dentro do container.
    //
    // Nível de topo e não recursivo, de propósito: é exatamente o conjunto que
    // viaja no zip.
    const extensoes = new Set(
      fs
        .readdirSync(TEMPLATE_DIR, { withFileTypes: true })
        .filter((entrada) => entrada.isFile())
        .map((entrada) => path.extname(entrada.name))
        .filter((ext) => ext !== ''),
    );
    expect(extensoes.size).toBeGreaterThan(0);

    // Compara o objeto inteiro, não só a extensão. `endsWith('*.tex')`
    // sozinho não olha o meio do glob: um `templatesXX/` passa verde e para
    // de empacotar main.tex e preambulo.tex. E comparar só o `include`
    // deixaria passar um `exclude` reintroduzido — o card 11 tirou os três
    // que havia, e um exclude novo tira arquivo do `dist` sem quebrar mais
    // nada.
    const esperados = [...extensoes]
      .map((ext) => ({ include: `modules/caderno/templates/**/*${ext}` }))
      .sort((a, b) => a.include.localeCompare(b.include));

    expect(
      [...doCaderno].sort((a, b) => a.include.localeCompare(b.include)),
    ).toEqual(esperados);
  });

  it('o LEIA-ME não aponta para o manifest.json, que não existe nesta POC', () => {
    // Os avisos da geração saem num bloco de `% AVISO:` no topo do
    // conteudo.tex. Apontar para um arquivo que não vem no zip manda a pessoa
    // procurar o que não existe.
    const leiaMe = lerTexto('LEIA-ME.txt');
    expect(leiaMe).not.toContain('manifest.json');
    expect(leiaMe).toContain('% AVISO:');
  });

  it('o LEIA-ME explica o que é a caixa cinza no lugar da figura', () => {
    // O placeholder de imagem indisponível é uma caixa cinza sem texto —
    // visível, mas muda. Sem esta explicação o coordenador vê um retângulo e
    // não sabe se é defeito do template, da questão ou da impressão.
    const leiaMe = lerTexto('LEIA-ME.txt');
    expect(leiaMe.toLowerCase()).toContain('caixa cinza');
    expect(leiaMe).toMatch(/n[ãa]o p[ôo]de ser baixada/i);
  });

  it('o LEIA-ME manda publicar na plataforma, não abrir um PR', () => {
    // ⚠️ Este arquivo viaja dentro de TODA prova gerada. Antes do card 11 a
    // fonte da verdade era o repo e a instrução certa era um pull request.
    // Agora é a versão publicada no Mongo — e mandar pedir PR a um
    // desenvolvedor é exatamente o atrito que os cards 10 a 13 removem.
    const leiaMe = lerTexto('LEIA-ME.txt');
    expect(leiaMe).not.toMatch(/pull request/i);
    expect(leiaMe.toLowerCase()).toContain('plataforma');
  });

  it('os cabeçalhos do template não citam um diretório que não existe', () => {
    // O nível `padrao/` foi decidido fora nesta POC. Um comentário que se
    // descreve como `padrao/v1` manda o leitor procurar o que não há.
    for (const arquivo of ['main.tex', 'preambulo.tex']) {
      expect(lerTexto(arquivo)).not.toContain('padrao/v1');
    }
  });

  it('o template não cita cards que não existem nesta POC', () => {
    // Os arquivos vieram com a numeração da POC anterior. Aqui não existe
    // card 08 (nem além): não há compilação no servidor, quem compila é o
    // Overleaf ou o usuário local com latexmk. Cards 05, 06 e 07 existem e
    // não devem ser banidos por engano.
    for (const arquivo of ['main.tex', 'preambulo.tex']) {
      expect(lerTexto(arquivo)).not.toMatch(/card 0[89]/);
    }
  });
});

describe('template não promete o gabarito do professor', () => {
  // O gerador emite só \choice: \CorrectChoice renderiza idêntico sem a opção
  // `answers`, então o gabarito não apareceria no PDF mas estaria em texto
  // claro no conteudo.tex, que vai para um projeto compartilhável do Overleaf.
  //
  // ⚠️ O que precisa sumir é a INSTRUÇÃO, não a palavra. Os dois arquivos
  // explicam por que a opção não serve, e para isso precisam nomeá-la — um
  // teste que banisse a substring crua forçaria circunlóquio, e circunlóquio é
  // o que faz alguém "consertar" o texto reintroduzindo a promessa.
  const arquivosDoZip = ['main.tex', 'LEIA-ME.txt'];

  it.each(arquivosDoZip)('%s não manda ligar a opção answers', (arquivo) => {
    const texto = lerTexto(arquivo);
    expect(texto).not.toContain('answers]{exam}');
    expect(texto.toLowerCase()).not.toContain('destacada');
  });

  it('LEIA-ME.txt não tem mais a seção do gabarito do professor', () => {
    expect(lerTexto('LEIA-ME.txt')).not.toMatch(/GABARITO DO PROFESSOR/i);
  });

  it.each(arquivosDoZip)(
    '%s diz que a resposta não vem no pacote',
    (arquivo) => {
      // Asserção POSITIVA de propósito. Banir a promessa não impede o texto de
      // simplesmente ficar calado sobre o assunto — e calado é como a dúvida
      // volta ("cadê o gabarito?"). O template tem que responder.
      expect(lerTexto(arquivo).toLowerCase()).toMatch(
        /(não|nao) (vem|viaja|aparece).{0,40}(pacote|zip|caderno)|fonte da verdade/,
      );
    },
  );
});
