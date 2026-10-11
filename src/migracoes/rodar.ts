/**
 * Ponto de entrada das migrações no deploy: `node migracoes/rodar.js` (no container,
 * `dist/` é a raiz). Roda ANTES do app — ver o `CMD` do `ms.dockerfile`.
 *
 * À mão (local): `yarn migracoes` (lê o `MONGODB` do `.env`).
 *
 * Sai com código 1 se uma migração falhar: o container não sobe o app, e o deploy aparece
 * como falho em vez de o ms rodar contra um banco pela metade.
 */
// ⚠️ Sem `dotenv` aqui: ele não está nas dependências de produção, e no container o ambiente
// já vem pelas variáveis. O `.env` local entra pelo `-r dotenv/config` do `yarn migracoes`.
import mongoose from 'mongoose';
import { rodarMigracoes } from './executor';
import { MIGRACOES, SEEDS } from './registro';

async function main(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) throw new Error('MONGODB não definida');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('falha ao obter a conexão do banco');
  console.log(`migrações: banco "${db.databaseName}"`);
  const r = await rodarMigracoes(db, { migracoes: MIGRACOES, seeds: SEEDS });
  console.log(
    `migrações: ${r.aplicadas.length} aplicada(s) agora, ${r.jaAplicadas.length} já aplicada(s); ${r.seeds.length} seed(s)`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ migrações:', err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
