/**
 * Seed — modelo do caderno (Caderno / Card 10): a versão 1 de `main.tex` e `preambulo.tex`.
 *
 * ⚠️ Idempotente: se já existir QUALQUER versão, não escreve (depois do seed, o Mongo é a fonte
 * da verdade do layout). Roda em todo deploy (`src/migracoes`) ou à mão
 * (`yarn seed:template-caderno`).
 * ⚠️ Passa pelo próprio lint antes de inserir, como qualquer upload.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Db } from 'mongodb';
import { lintarTemplate } from '../../modules/caderno/template/template-lint';

const COLECAO = 'cadernotemplates';

/**
 * ⚠️ Relativo a ESTE arquivo: `src/migracoes/seeds` → `src/modules/caderno/templates/v1`, e o
 * mesmo caminho no `dist` (o `nest-cli.json` copia os `.tex`).
 */
export const DIR_DO_TEMPLATE = path.join(
  __dirname,
  '../../modules/caderno/templates/v1',
);

/** Devolve o que fez — vai para o registro em `_migracoes`. */
export async function semearTemplateCaderno(
  db: Db,
  dir: string = DIR_DO_TEMPLATE,
): Promise<string> {
  const existentes = await db.collection(COLECAO).countDocuments();
  if (existentes > 0) return `já existem ${existentes} versão(ões)`;

  const arquivos = {
    'main.tex': fs.readFileSync(path.join(dir, 'main.tex'), 'utf-8'),
    'preambulo.tex': fs.readFileSync(path.join(dir, 'preambulo.tex'), 'utf-8'),
  };
  const lint = lintarTemplate(arquivos);
  if (lint.podePublicar === false) {
    throw new Error(
      `o template do repo não passa no lint: ${lint.erros.join('; ')}`,
    );
  }

  const agora = new Date();
  await db.collection(COLECAO).insertOne({
    versao: 1,
    status: 'publicada',
    arquivos,
    criadorId: 'system',
    publicadaEm: agora,
    notas: 'seed do repo',
    origemVersao: null,
    deleted: false,
    createdAt: agora,
    updatedAt: agora,
  });
  return 'versão 1 inserida como publicada';
}
