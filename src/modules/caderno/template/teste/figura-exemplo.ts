import * as fs from 'fs';
import * as path from 'path';

/**
 * A figura da questão 49 do simulado de teste.
 *
 * ⚠️ Lida com `readFileSync`, **não importada**: um `import` de arquivo fora
 * do grafo do TypeScript desloca o `rootDir` inferido e move o `dist/main.js`,
 * quebrando o PM2 com "Script not found". Mesmo motivo do
 * `imagens/placeholder.ts`, que é o molde daqui.
 *
 * ⚠️ Mora ao lado do código que a usa, e **não** em `templates/v1/exemplo/`:
 * aquele diretório era excluído do `dist`, então a figura não chegaria em
 * produção e o endpoint quebraria só dentro do container.
 */
export const CAMINHO_FIGURA_EXEMPLO = path.join(
  __dirname,
  'figura-exemplo.png',
);

export function lerFiguraExemplo(): Buffer {
  return fs.readFileSync(CAMINHO_FIGURA_EXEMPLO);
}
