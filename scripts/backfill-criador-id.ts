/**
 * Backfill one-off — Etapa 4 / Card 01.
 *
 * Preenche `criadorId = 'system'` em provas (e simulados) legados que não têm o
 * campo, ANTES do deploy do schema novo (`Prova.criadorId` é `required`).
 * Sem esse backfill, qualquer re-save de uma prova legada falharia na validação.
 *
 * Uso (rodar em janela de manutenção, apontando pro banco alvo):
 *   MONGODB="mongodb://.../db" npx ts-node scripts/backfill-criador-id.ts
 *   (ou com um .env contendo MONGODB, via dotenv/config já importado abaixo)
 *
 * Idempotente: só toca documentos sem `criadorId` (ou com `criadorId: null`).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const SENTINELA = 'system';
const FILTRO = { $or: [{ criadorId: { $exists: false } }, { criadorId: null }] };

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

  const provas = await db
    .collection('provas')
    .updateMany(FILTRO, { $set: { criadorId: SENTINELA } });
  console.log(`✓ Provas atualizadas: ${provas.modifiedCount}`);

  // Simulado.criadorId é opcional; backfill por consistência (não é obrigatório).
  const simulados = await db
    .collection('simulados')
    .updateMany(FILTRO, { $set: { criadorId: SENTINELA } });
  console.log(`✓ Simulados atualizados: ${simulados.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Backfill concluído.');
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
