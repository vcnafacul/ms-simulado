import * as fs from 'fs';
import * as path from 'path';
import { lintarTemplate } from './template-lint';

/** Um template mínimo que passa em tudo. Cada teste quebra UMA coisa. */
const OK = {
  'main.tex': [
    '\\documentclass[11pt,a4paper,twocolumn]{exam}',
    '\\input{preambulo}',
    '\\input{metadados}',
    '\\begin{document}',
    '\\begin{questions}',
    '\\input{conteudo}',
    '\\end{questions}',
    '\\end{document}',
  ].join('\n'),
  'preambulo.tex': '\\usepackage[T1]{fontenc}',
};

const semA = (linha: string) => ({
  ...OK,
  'main.tex': OK['main.tex']
    .split('\n')
    .filter((l) => !l.includes(linha))
    .join('\n'),
});

describe('lintarTemplate — o feliz', () => {
  it('o template mínimo passa, sem erro e sem aviso', () => {
    const r = lintarTemplate(OK);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.podePublicar).toBe(true);
  });

  it('o template REAL do repo passa', () => {
    // ⚠️ Se o seed reprova na própria régua, o card se contradiz.
    const dir = path.join(__dirname, '../templates/v1');
    const r = lintarTemplate({
      'main.tex': fs.readFileSync(path.join(dir, 'main.tex'), 'utf-8'),
      'preambulo.tex': fs.readFileSync(
        path.join(dir, 'preambulo.tex'),
        'utf-8',
      ),
    });
    expect(r.erros).toEqual([]);
    expect(r.podePublicar).toBe(true);
  });
});

describe('lintarTemplate — as sete que bloqueiam', () => {
  it.each([
    ['\\documentclass', 'documentclass'],
    ['\\begin{document}', 'begin{document}'],
    ['\\end{document}', 'end{document}'],
    ['\\input{preambulo}', 'input{preambulo}'],
    ['\\input{conteudo}', 'input{conteudo}'],
    ['\\input{metadados}', 'input{metadados}'],
    ['\\begin{questions}', 'begin{questions}'],
    ['\\end{questions}', 'end{questions}'],
  ])('faltando %s → erro que nomeia a regra', (_rotulo, trecho) => {
    const r = lintarTemplate(semA(trecho));
    expect(r.podePublicar).toBe(false);
    expect(r.erros.join(' ')).toContain(trecho);
  });

  it('O CASO PERIGOSO: \\input{conteudo} só dentro de comentário → erro', () => {
    // Sem esta regra, a prova compila perfeitamente e sai vazia. É o motivo
    // de a peça `semComentarios` existir.
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'].replace(
        '\\input{conteudo}',
        '% \\input{conteudo}',
      ),
    });
    expect(r.podePublicar).toBe(false);
    expect(r.erros.join(' ')).toContain('conteudo');
  });

  it('\\begin sem \\end → erro de balanceamento', () => {
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'].replace('\\end{questions}', ''),
    });
    expect(r.podePublicar).toBe(false);
  });

  it('\\end sem \\begin correspondente → erro', () => {
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'] + '\n\\end{center}',
    });
    expect(r.podePublicar).toBe(false);
  });

  it.each([
    ['\\write18{rm -rf /}'],
    ['\\openin1=/etc/passwd'],
    ['\\usepackage{shellesc}'],
    ['\\input{/etc/passwd}'],
    ['\\input{../segredo}'],
    ['\\include{../../x}'],
  ])('proibido: %s', (perigoso) => {
    const r = lintarTemplate({ ...OK, 'preambulo.tex': perigoso });
    expect(r.podePublicar).toBe(false);
  });

  it('\\input{sub/arquivo} NÃO é erro', () => {
    // ⚠️ A regra é sobre SAIR do diretório, não sobre ter barra. Um
    // subcaminho relativo não sai — ele só não existe no zip, e a falha
    // aparece na compilação, visível.
    const r = lintarTemplate({
      ...OK,
      'preambulo.tex': '\\input{sub/arquivo}',
    });
    expect(r.podePublicar).toBe(true);
  });

  it('o proibido dentro de comentário NÃO é erro', () => {
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '% \\write18{ls}' });
    expect(r.podePublicar).toBe(true);
  });
});

describe('lintarTemplate — as duas que avisam', () => {
  it('chave desbalanceada AVISA, e deixa publicar', () => {
    // ⚠️ Decisão do usuário. É a única regra que pode dar falso positivo num
    // template válido — LaTeX tem construtos onde chave desbalanceada é
    // legítima. E o Overleaf já mostrou o PDF compilando antes do upload.
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '\\def\\x{aberta' });
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(r.erros).toEqual([]);
    expect(r.podePublicar).toBe(true);
  });

  it('chave escapada e comentada não conta no balanço', () => {
    const r = lintarTemplate({
      ...OK,
      'preambulo.tex': '\\textbackslash\\{ % aqui tem { solta no comentário',
    });
    expect(r.avisos).toEqual([]);
  });

  it('macro que o metadados.tex não define AVISA', () => {
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'] + '\n\\cadernoInexistente',
    });
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(r.podePublicar).toBe(true);
  });

  it('as QUATRO macros que o metadados.tex gera não avisam', () => {
    // ⚠️ São quatro, não três — medido em `gerar-caderno.ts:90-105`.
    // `\cadernoTitulo` e `\cadernoSubtitulo` sempre; `\cadernoRascunho` (como
    // `\cadernoRascunhotrue`) e `\cadernoPendencias` só no modo rascunho.
    const r = lintarTemplate({
      ...OK,
      'main.tex':
        OK['main.tex'] +
        '\n\\cadernoTitulo\\cadernoSubtitulo\\cadernoPendencias' +
        '\n\\ifcadernoRascunho\\cadernoRascunhotrue\\fi',
    });
    expect(r.avisos).toEqual([]);
  });

  it('macro que o PRÓPRIO template define não avisa', () => {
    // ⚠️ O `preambulo.tex` real tem `\providecommand{\cadernoTitulo}{...}`
    // justamente para o caso de o `metadados.tex` não vir. Se um
    // `\providecommand` próprio não contasse como definição, o mecanismo de
    // default do template viraria aviso.
    const r = lintarTemplate({
      ...OK,
      'preambulo.tex':
        '\\providecommand{\\cadernoLegenda}{padrão}\n\\cadernoLegenda',
    });
    expect(r.avisos).toEqual([]);
  });
});

describe('lintarTemplate — o erro diz onde', () => {
  it('nomeia o arquivo e a linha', () => {
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '\n\n\\write18{ls}' });
    expect(r.erros[0]).toContain('preambulo.tex');
    expect(r.erros[0]).toMatch(/linha 3/);
  });
});
