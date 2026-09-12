import * as fs from 'fs';
import * as path from 'path';
import { extensaoDosBytes } from './formato';
import { CAMINHO_PLACEHOLDER, lerPlaceholder } from './placeholder';

describe('placeholder de imagem indisponível', () => {
  it('existe no repo e é um PNG de verdade', () => {
    // Se não for PNG válido, a prova sai com um erro de LaTeX no lugar do
    // marcador — trocando um defeito visível por um que trava a compilação.
    const buffer = fs.readFileSync(CAMINHO_PLACEHOLDER);
    expect(buffer.length).toBeGreaterThan(0);
    expect(extensaoDosBytes(buffer)).toBe('png');
  });

  it('lerPlaceholder devolve os bytes', () => {
    expect(extensaoDosBytes(lerPlaceholder())).toBe('png');
  });

  it('tem um glob no nest-cli.json que o leva para o dist', () => {
    // ⚠️ O ms.dockerfile faz `COPY dist ./` e nada mais: arquivo fora do
    // `dist` NÃO EXISTE em produção. Sem este glob, toda falha de imagem vira
    // "File not found" no LaTeX, e só dentro do container.
    //
    // ⚠️ O teste de globs do card 00 NÃO cobre este arquivo: ele filtra por
    // `startsWith('modules/caderno/templates')`, e este mora em
    // `modules/caderno/imagens`. Por isso existe aqui.
    const nestCli = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../../../../nest-cli.json'),
        'utf-8',
      ),
    ) as { compilerOptions: { assets: { include: string }[] } };

    const relativo = path
      .relative(path.join(__dirname, '../../..'), CAMINHO_PLACEHOLDER)
      .replace(/\\/g, '/');

    expect(relativo).toBe('modules/caderno/imagens/imagem-indisponivel.png');
    expect(nestCli.compilerOptions.assets.map((a) => a.include)).toContain(
      'modules/caderno/imagens/*.png',
    );
  });
});
