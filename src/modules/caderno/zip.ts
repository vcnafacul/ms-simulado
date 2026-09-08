import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ArquivoDoZip } from './imagens/tipos';
import { ARQUIVOS_DO_ZIP, TEMPLATE_DIR } from './templates';

/**
 * Monta o pacote que o usuário sobe no Overleaf.
 *
 * ⚠️ **Raiz plana.** Os `\input{preambulo}`, `\input{metadados}` e o
 * `\includegraphics{logo.png}` do `main.tex` resolvem relativo a ele, então os
 * arquivos do template ficam lado a lado. `assets/` é a única subpasta.
 *
 * ⚠️ **`TEMPLATE_DIR` é importado, nunca recalculado.** Um
 * `path.join(__dirname, 'templates/v1')` daqui resolveria para outro lugar, e o
 * teste do card 00 **não pegaria** — o `__dirname` dele é o do próprio spec.
 * Ver o docblock de `templates.ts`.
 *
 * ⚠️ **O template vem do repo a cada geração.** É o que impede deriva: ninguém
 * ajusta layout num projeto do Overleaf e esquece de trazer de volta, porque a
 * próxima prova sai com o que está versionado.
 */

export interface PacoteDoCaderno {
  conteudo: string;
  metadados: string;
  imagens: ArquivoDoZip[];
}

export async function montarZip(pacote: PacoteDoCaderno): Promise<Buffer> {
  const zip = new JSZip();

  for (const arquivo of ARQUIVOS_DO_ZIP) {
    zip.file(arquivo, fs.readFileSync(path.join(TEMPLATE_DIR, arquivo)));
  }

  zip.file('conteudo.tex', pacote.conteudo);
  zip.file('metadados.tex', pacote.metadados);

  for (const imagem of pacote.imagens) {
    zip.file(imagem.nome, imagem.buffer);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}
