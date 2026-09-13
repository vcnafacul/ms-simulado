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

/**
 * Os dois arquivos de layout. **Vêm do Mongo** desde o card 11 — a versão
 * publicada, não o disco.
 *
 * ⚠️ Eles continuam existindo em `templates/v1/` e continuam sendo copiados
 * para o `dist`: são a semente do `seed:template-caderno` e a cópia de
 * resgate. O que mudou é quem o zip da prova lê.
 */
export const ARQUIVOS_DO_TEMPLATE = ['main.tex', 'preambulo.tex'];

/**
 * O que continua vindo do disco.
 *
 * `logo.png` é binário e trocar logo é raro; o `LEIA-ME.txt` descreve o
 * *fluxo*, que muda com o código, não com o layout. Nenhum dos dois é
 * editável pelo Overleaf, então nenhum dos dois entrou no card 10.
 */
export const ARQUIVOS_DO_REPO = ['logo.png', 'LEIA-ME.txt'];

/**
 * Chave semântica → nome do arquivo na raiz do zip.
 *
 * ⚠️ **O mapa mora aqui, não no chamador.** O api manda `{ vnf, cursinho }`;
 * quem decide que `cursinho` vira `logo_cursinho.png` é este serviço, junto
 * com o resto do layout do zip. Deixar o chamador mandar o nome do arquivo
 * faria quem manda os bytes ditar a estrutura do pacote.
 *
 * ⚠️ Raiz plana, como os `ARQUIVOS_DO_REPO`: o `\includegraphics` do
 * `main.tex` resolve relativo a ele. `assets/` é a única subpasta, e é das
 * imagens das questões.
 */
export const NOMES_DOS_LOGOS = {
  vnf: 'logo_vnf.png',
  cursinho: 'logo_cursinho.png',
} as const;

export type ChaveDeLogo = keyof typeof NOMES_DOS_LOGOS;
