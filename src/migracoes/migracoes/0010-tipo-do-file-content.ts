/**
 * Migração 0010 — `tipo` nos `FileContent` que existiam antes do conteúdo em
 * vídeo (tickets/049). Todos eram documento; o schema já tem default, mas
 * consulta por `tipo` ou `$ne` não vê default — por isso a gravação.
 *
 * Idempotente.
 */
import type { Db } from 'mongodb';

export async function migrar0010(db: Db): Promise<{ atualizados: number }> {
  const res = await db
    .collection('filecontents')
    .updateMany({ tipo: { $exists: false } }, { $set: { tipo: 'documento' } });
  return { atualizados: res.modifiedCount };
}
