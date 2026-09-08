import * as fs from 'fs';
import * as path from 'path';

/**
 * O que entra no zip quando uma imagem não pôde ser resolvida.
 *
 * ⚠️ **Toda falha precisa produzir um arquivo.** O card 02 já escreveu
 * `\includegraphics{assets/01}` no `.tex`; se este card não gravar nada com
 * aquele nome, o LaTeX para com "File not found" — o pior desfecho desta POC,
 * porque a pessoa não recebe nada que dê para consertar.
 *
 * ⚠️ Lido com `readFileSync`, não importado: `.ts` fora de `src/` desloca o
 * `rootDir` inferido e move o `dist/main.js`, quebrando o PM2. Ver
 * `ms-simulado-build-rootdir`.
 */
export const CAMINHO_PLACEHOLDER = path.join(
  __dirname,
  'imagem-indisponivel.png',
);

export function lerPlaceholder(): Buffer {
  return fs.readFileSync(CAMINHO_PLACEHOLDER);
}
