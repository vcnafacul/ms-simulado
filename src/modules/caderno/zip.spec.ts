import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ARQUIVOS_DO_REPO, TEMPLATE_DIR } from './templates';
import { montarZip } from './zip';

const abrir = async (buffer: Buffer) => JSZip.loadAsync(buffer);

/**
 * ⚠️ O template do teste é DIFERENTE do que está no repo, de propósito: é o
 * que prova que o zip levou o que recebeu, e não o que está no disco.
 */
const TEMPLATE_FALSO: Record<string, string> = {
  'main.tex': '\\documentclass{exam}% VEM DO MONGO\n',
  'preambulo.tex': '\\usepackage{amsmath}% VEM DO MONGO\n',
};

const pacote = () =>
  montarZip({
    template: TEMPLATE_FALSO,
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

  it('os .tex saem do que foi RECEBIDO, não do disco', async () => {
    // ⚠️ O teste central deste card. Antes, o zip lia os quatro arquivos do
    // repo; agora os dois de layout vêm da versão publicada no Mongo. Se ele
    // continuasse lendo do disco, editar o template no banco não mudaria a
    // prova — e nada falharia: o zip sairia perfeito, com o layout velho.
    const zip = await abrir(await pacote());

    for (const [nome, texto] of Object.entries(TEMPLATE_FALSO)) {
      expect(await zip.file(nome)!.async('string')).toBe(texto);
    }

    const noRepo = fs.readFileSync(
      path.join(TEMPLATE_DIR, 'main.tex'),
      'utf-8',
    );
    expect(await zip.file('main.tex')!.async('string')).not.toBe(noRepo);
  });

  it('logo.png e LEIA-ME.txt continuam byte-idênticos ao repo', async () => {
    const zip = await abrir(await pacote());
    for (const arquivo of ARQUIVOS_DO_REPO) {
      const noZip = await zip.file(arquivo)!.async('nodebuffer');
      const noRepo = fs.readFileSync(path.join(TEMPLATE_DIR, arquivo));
      expect(noZip.equals(noRepo)).toBe(true);
    }
  });

  it.each(['main.tex', 'preambulo.tex'])(
    'template sem %s → recusa, nomeando o que faltou',
    async (ausente) => {
      // ⚠️ Sem isto o zip sai com um arquivo só e o LaTeX para com
      // "File not found" — a pessoa recebe um zip que não compila e nada
      // dizendo por quê. O lint do card 10 torna isso improvável, não
      // impossível: uma versão semeada à mão passa longe dele.
      const incompleto = { ...TEMPLATE_FALSO };
      delete incompleto[ausente];

      await expect(
        montarZip({
          template: incompleto,
          conteudo: '',
          metadados: '',
          imagens: [],
        }),
      ).rejects.toThrow(ausente);
    },
  );

  it('leva o conteudo.tex e o metadados.tex gerados', async () => {
    const zip = await abrir(await pacote());
    expect(await zip.file('conteudo.tex')!.async('string')).toContain(
      '% AVISO: um',
    );
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      'cadernoTitulo',
    );
  });

  it('sem imagem nenhuma, ainda monta', async () => {
    const buffer = await montarZip({
      template: TEMPLATE_FALSO,
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
      template: TEMPLATE_FALSO,
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
