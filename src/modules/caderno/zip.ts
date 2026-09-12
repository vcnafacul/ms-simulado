import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ArquivoDoZip } from './imagens/tipos';
import {
  ARQUIVOS_DO_REPO,
  ARQUIVOS_DO_TEMPLATE,
  TEMPLATE_DIR,
} from './templates';

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
 * ⚠️ **Os dois `.tex` de layout vêm de quem chama, não do repo** — desde o
 * card 11 são a versão *publicada* no Mongo. É o que fecha o circuito do
 * card 10: quem ajusta o layout publica uma versão nova, e a próxima prova sai
 * com ela. Os arquivos em `templates/v1/` deixaram de ser a fonte da verdade
 * do zip; sobraram como semente do seed e cópia de resgate. Só `logo.png` e
 * `LEIA-ME.txt` ainda saem do disco.
 */

export interface PacoteDoCaderno {
  /** `main.tex` e `preambulo.tex`, da versão publicada no Mongo. */
  template: Record<string, string>;
  conteudo: string;
  metadados: string;
  imagens: ArquivoDoZip[];
}

export async function montarZip(pacote: PacoteDoCaderno): Promise<Buffer> {
  const faltando = ARQUIVOS_DO_TEMPLATE.filter(
    (nome) => typeof pacote.template[nome] !== 'string',
  );
  if (faltando.length) {
    throw new Error(
      `template incompleto: falta ${faltando.join(' e ')} na versão publicada`,
    );
  }

  const zip = new JSZip();

  for (const arquivo of ARQUIVOS_DO_TEMPLATE) {
    zip.file(arquivo, pacote.template[arquivo]);
  }

  for (const arquivo of ARQUIVOS_DO_REPO) {
    zip.file(arquivo, fs.readFileSync(path.join(TEMPLATE_DIR, arquivo)));
  }

  zip.file('conteudo.tex', pacote.conteudo);
  zip.file('metadados.tex', pacote.metadados);

  for (const imagem of pacote.imagens) {
    zip.file(imagem.nome, imagem.buffer);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}
