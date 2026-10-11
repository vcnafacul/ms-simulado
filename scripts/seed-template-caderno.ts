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
import mongoose from 'mongoose';
import { semearTemplateCaderno } from '../src/migracoes/seeds/template-caderno';

async function run(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Falha ao obter a conexão do banco.');
    process.exit(1);
  }
  console.log(`✓ ${await semearTemplateCaderno(db)}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
