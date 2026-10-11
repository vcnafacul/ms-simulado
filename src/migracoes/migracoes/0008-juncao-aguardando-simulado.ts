/**
 * Migração 0008 — junção do relatório com linha "aguardando simulado" (tickets/038, card 13).
 * Detalhes e rollback: `scripts/migrations/0008-juncao-aguardando-simulado/README.md`.
 *
 * Idempotente. Roda sozinha no deploy (`src/migracoes`) ou à mão (`yarn migracao:0008`).
 */
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
