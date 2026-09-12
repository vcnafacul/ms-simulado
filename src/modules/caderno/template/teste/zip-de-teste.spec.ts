import JSZip from 'jszip';
import { ImagemRef } from '../../gerador/tipos';
import { montarZipDeTeste, resolverLocalmente } from './zip-de-teste';

const TEMPLATE = {
  'main.tex': '\\documentclass{exam}% V9\n',
  'preambulo.tex': '\\usepackage{amsmath}\n',
};

const abrir = async () => JSZip.loadAsync(await montarZipDeTeste(TEMPLATE));

describe('montarZipDeTeste', () => {
  it('tem os mesmos arquivos do zip da prova', async () => {
    const zip = await abrir();
    const nomes = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(nomes).toEqual([
      'LEIA-ME.txt',
      'assets/01.png',
      'conteudo.tex',
      'logo.png',
      'main.tex',
      'metadados.tex',
      'preambulo.tex',
    ]);
  });

  it('leva o template RECEBIDO, não o do repo', async () => {
    const zip = await abrir();
    expect(await zip.file('main.tex')!.async('string')).toContain('% V9');
  });

  it('a marca d’água está LIGADA', async () => {
    // ⚠️ `\cadernoRascunhotrue`, não `\def\cadernoRascunho{true}`: a segunda
    // forma não liga nada e não dá erro. Um zip de teste sem marca d'água
    // pode ser impresso como prova.
    const zip = await abrir();
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      '\\cadernoRascunhotrue',
    );
  });

  it('o título diz que é teste', async () => {
    const zip = await abrir();
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      'TEMPLATE DE TESTE',
    );
  });

  it('a figura entra com os bytes do PNG commitado', async () => {
    const zip = await abrir();
    const bytes = await zip.file('assets/01.png')!.async('nodebuffer');
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('as seis questões estão no conteudo.tex', async () => {
    const zip = await abrir();
    const conteudo = await zip.file('conteudo.tex')!.async('string');
    expect(conteudo.match(/\\question/g)).toHaveLength(6);
  });
});

/**
 * ⚠️ Testada direto, com refs sintéticas, e **não** através do
 * `SIMULADO_DE_TESTE`: o mock tem uma imagem só e vai ter por bom tempo, então
 * um teste que dependesse dele para cobrir o caso de duas imagens seria
 * frágil e indireto. A regra mora aqui, e é aqui que ela é provada.
 */
describe('resolverLocalmente', () => {
  const refs: ImagemRef[] = [
    { origem: 'r2', key: 'a/b.png', arquivo: 'assets/07' },
    { origem: 'url', url: 'https://exemplo/c.jpg', arquivo: 'assets/42' },
  ];

  it('TODA ref vira arquivo, com o nome vindo de ref.arquivo — não do índice', () => {
    // ⚠️ Se só a primeira fosse resolvida, o `\includegraphics{assets/42}` do
    // conteudo.tex não acharia arquivo nenhum e o LaTeX pararia com "File not
    // found" — a falha que o card 03 existe para impedir. Nomear pelo índice
    // erra do mesmo jeito, e em silêncio: o arquivo existe, com o nome errado.
    const arquivos = resolverLocalmente(refs);
    expect(arquivos.map((a) => a.nome)).toEqual([
      'assets/07.png',
      'assets/42.png',
    ]);
  });

  it('cada uma leva os bytes do PNG commitado', () => {
    const arquivos = resolverLocalmente(refs);
    for (const arquivo of arquivos) {
      expect(arquivo.buffer.subarray(0, 4)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
    }
  });
});
