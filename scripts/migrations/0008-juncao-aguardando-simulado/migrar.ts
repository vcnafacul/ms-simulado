/**
 * Migração 0008 — junção do relatório com linha "aguardando simulado" (tickets/038, card 13).
 *
 * O cartão DA PROVA do ENEM Dia 1 do cursinho só sabe o simulado no callback (pelo idioma).
 * A linha da junção (`relatoriosimuladoestudantes`) nasce no envio com o simulado vazio, e o
 * índice único `{simulado, cursinhoId, usuario}` de hoje (sem nome, não parcial) faria duas
 * linhas assim do mesmo aluno — cartões de provas diferentes — colidirem em `null`.
 *
 * Troca o índice pelo `juncao_por_estudante` (mesma chave, PARCIAL em simulado ObjectId) e
 * cria o das linhas aguardando por prova. Cria o novo ANTES de apagar o antigo: a chave é a
 * mesma, então não há duplicado possível, e nunca fica sem a trava.
 *
 * Uso:
 *   MONGODB='mongodb://...' yarn migracao:0008            # só mostra os índices
 *   MONGODB='mongodb://...' yarn migracao:0008 --aplicar  # troca
 *
 * Idempotente.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';

export const COLECAO = 'relatoriosimuladoestudantes';
export const INDICE_ANTIGO = 'simulado_1_cursinhoId_1_usuario_1';
export const INDICE_NOVO = 'juncao_por_estudante';
export const INDICE_AGUARDANDO = 'prova_1_cursinhoId_1';

export async function migrar0008(
  db: Db,
  aplicar: boolean,
): Promise<{ antigo: boolean; novo: boolean; aguardando: boolean }> {
  const col = db.collection(COLECAO);
  if (aplicar) {
    await col.createIndex(
      { simulado: 1, cursinhoId: 1, usuario: 1 },
      {
        unique: true,
        name: INDICE_NOVO,
        partialFilterExpression: { simulado: { $type: 'objectId' } },
      },
    );
    if ((await col.indexes()).some((i) => i.name === INDICE_ANTIGO)) {
      await col.dropIndex(INDICE_ANTIGO);
    }
    await col.createIndex(
      { prova: 1, cursinhoId: 1 },
      {
        name: INDICE_AGUARDANDO,
        partialFilterExpression: { aguardandoSimulado: true },
      },
    );
  }
  const nomes = (await col.indexes()).map((i) => i.name);
  return {
    antigo: nomes.includes(INDICE_ANTIGO),
    novo: nomes.includes(INDICE_NOVO),
    aguardando: nomes.includes(INDICE_AGUARDANDO),
  };
}

async function run(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }
  const aplicar = process.argv.includes('--aplicar');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Falha ao obter a conexão do banco.');
  const r = await migrar0008(db, aplicar);
  console.log(
    `índices: ${INDICE_ANTIGO}=${r.antigo} ${INDICE_NOVO}=${r.novo} ${INDICE_AGUARDANDO}=${r.aguardando}`,
  );
  if (aplicar) {
    if (r.antigo || !r.novo || !r.aguardando) {
      throw new Error('troca de índices não concluída');
    }
    console.log('migração 0008 OK');
  } else {
    console.log('modo CONSULTA — nada foi escrito. Para aplicar: --aplicar');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    await mongoose.disconnect();
    process.exit(1);
  });
}
