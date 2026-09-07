import * as path from 'path';

/**
 * Diretório do template, resolvido a partir DESTE arquivo.
 *
 * Existe como módulo, e não como constante dentro do spec, para que o card 04
 * importe exatamente o mesmo caminho que o teste assere. Se cada um calcular o
 * seu, os dois derivam: o serviço pode nascer num subdiretório
 * (`caderno/zip/…`), onde `path.join(__dirname, 'templates/v1')` resolve para
 * lugar nenhum, e o teste continuaria verde apontando para o lugar certo.
 */
export const TEMPLATE_DIR = path.join(__dirname, 'templates/v1');

/** Os quatro arquivos que viajam no zip do usuário. O `exemplo/` não entra. */
export const ARQUIVOS_DO_ZIP = [
  'main.tex',
  'preambulo.tex',
  'logo.png',
  'LEIA-ME.txt',
];
