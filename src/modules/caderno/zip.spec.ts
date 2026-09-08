import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ARQUIVOS_DO_ZIP, TEMPLATE_DIR } from './templates';
import { montarZip } from './zip';

const abrir = async (buffer: Buffer) => JSZip.loadAsync(buffer);

const pacote = () =>
  montarZip({
    conteudo: '% AVISO: um\n\n\\question Teste\n',
    metadados: '\\def\\cadernoTitulo{Teste}\n',
    imagens: [
      { nome: 'assets/01.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { nome: 'assets/02.jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) },
    ],
  });

describe('montarZip — estrutura', () => {
  it('tem raiz plana, com assets/ como única subpasta', async () => {
    const zip = await abrir(await pacote());
    const nomes = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(nomes).toEqual([
      'LEIA-ME.txt',
      'assets/01.png',
      'assets/02.jpeg',
      'conteudo.tex',
      'logo.png',
      'main.tex',
      'metadados.tex',
      'preambulo.tex',
    ]);
  });

  it('os arquivos do template são byte-idênticos ao repo', async () => {
    // O template é a fonte da verdade do layout. Se o zip levar uma cópia
    // divergente, o usuário ajusta no Overleaf uma coisa que não é a que está
    // versionada.
    const zip = await abrir(await pacote());
    for (const arquivo of ARQUIVOS_DO_ZIP) {
      const noZip = await zip.file(arquivo)!.async('nodebuffer');
      const noRepo = fs.readFileSync(path.join(TEMPLATE_DIR, arquivo));
      expect(noZip.equals(noRepo)).toBe(true);
    }
  });

  it('leva o conteudo.tex e o metadados.tex gerados', async () => {
    const zip = await abrir(await pacote());
    expect(await zip.file('conteudo.tex')!.async('string')).toContain(
      '% AVISO: um',
    );
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      'cadernoTitulo',
    );
  });

  it('não leva o exemplo/ do smoke test', async () => {
    // ⚠️ O `exemplo/` do card 00 são questões SINTÉTICAS, escritas à mão para
    // provar que o template compila. Vazar para o zip entregaria essas
    // questões junto com as reais, na prova do aluno.
    const zip = await abrir(await pacote());
    const nomes = Object.keys(zip.files);
    expect(nomes.some((n) => n.includes('exemplo'))).toBe(false);
  });

  it('sem imagem nenhuma, ainda monta', async () => {
    const buffer = await montarZip({
      conteudo: '\\question Teste\n',
      metadados: '\\def\\cadernoTitulo{T}\n',
      imagens: [],
    });
    const zip = await abrir(buffer);
    expect(zip.file('main.tex')).not.toBeNull();
    expect(Object.keys(zip.files).some((n) => n.startsWith('assets/'))).toBe(
      false,
    );
  });
});

describe('montarZip — o conteúdo chega inteiro', () => {
  it('as imagens saem com os bytes que entraram', async () => {
    const zip = await abrir(await pacote());
    const png = await zip.file('assets/01.png')!.async('nodebuffer');
    expect(png.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });

  it('o UTF-8 do conteudo.tex sobrevive', async () => {
    // Acento e cedilha estão em todo enunciado. Um zip que grave latin-1
    // entregaria "questÃ£o" na prova.
    const buffer = await montarZip({
      conteudo: 'A resistência é 100\\% da questão — ação\n',
      metadados: '\\def\\cadernoTitulo{Ação}\n',
      imagens: [],
    });
    const zip = await abrir(buffer);
    expect(await zip.file('conteudo.tex')!.async('string')).toBe(
      'A resistência é 100\\% da questão — ação\n',
    );
  });
});
