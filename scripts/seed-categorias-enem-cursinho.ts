/**
 * Seed — tickets/038, card 01 (R1).
 *
 * Cria as categorias "Enem Dia 1" e "Enem Dia 2" com `dono = Cursinho`: vistas
 * por todos os cursinhos, compostas por cada um na própria prova.
 *
 * Uso (apontando pro banco alvo):
 *   MONGODB="mongodb://.../db" yarn seed:categorias-enem-cursinho
 *
 * ⚠️ Idempotente: categoria viva com o mesmo `{dono, nome}` já existe → pula.
 * ⚠️ `exame`, `duracao` e `quantidadeTotalQuestao` vêm das "Enem Dia 1/2" da
 *    PLATAFORMA. Copiar em vez de
 *    fixar aqui evita uma segunda fonte para a duração do ENEM — e, se a da
 *    plataforma não existir, o seed para em vez de inventar um exame.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { semearCategoriasEnemCursinho } from '../src/migracoes/seeds/categorias-enem-cursinho';

export { semearCategoriasEnemCursinho };

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
  await semearCategoriasEnemCursinho(db);
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    await mongoose.disconnect();
    process.exit(1);
  });
}
