/**
 * Seed one-off — Caderno / Card 10.
 *
 * Insere a versão 1 do template do caderno, lendo `main.tex` e `preambulo.tex`
 * de `src/modules/caderno/templates/v1/`. Depois deste seed, o Mongo é a fonte
 * da verdade do layout; os arquivos do repo ficam como semente, referência de
 * dev e cópia de resgate.
 *
 * Uso (apontando pro banco alvo):
 *   MONGODB="mongodb://.../db" npx ts-node scripts/seed-template-caderno.ts
 *
 * ⚠️ Idempotente: se já existir qualquer versão, sai sem escrever.
 * ⚠️ Passa pelo PRÓPRIO lint antes de inserir. Um seed que entra sem passar
 *    pela régua que todos os outros uploads passam é uma exceção que ninguém
 *    lembra depois — e é justamente a versão que o "restaurar" traz de volta.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { lintarTemplate } from '../src/modules/caderno/template/template-lint';

const DIR = path.join(__dirname, '../src/modules/caderno/templates/v1');
const COLECAO = 'cadernotemplates';

async function run(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }

  const arquivos = {
    'main.tex': fs.readFileSync(path.join(DIR, 'main.tex'), 'utf-8'),
    'preambulo.tex': fs.readFileSync(path.join(DIR, 'preambulo.tex'), 'utf-8'),
  };

  const lint = lintarTemplate(arquivos);
  if (lint.podePublicar === false) {
    console.error('❌ O template do repo não passa no lint:');
    lint.erros.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }
  lint.avisos.forEach((a) => console.warn(`⚠️  ${a}`));

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Falha ao obter a conexão do banco.');
    process.exit(1);
  }

  const existentes = await db.collection(COLECAO).countDocuments();
  if (existentes > 0) {
    console.log(`✓ Já existem ${existentes} versão(ões). Nada a fazer.`);
    await mongoose.disconnect();
    return;
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

  console.log('✓ Versão 1 inserida como publicada.');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
