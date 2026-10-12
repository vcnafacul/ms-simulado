/**
 * Migração 0009 — linhas da junção presas em "aguardando simulado" (tickets/038).
 *
 * Até o conserto do `moverParaSimulado` (apagar antes de gravar) e da ordem no callback, um
 * cartão da prova podia concluir a leitura com a linha do relatório ainda "aguardando": o
 * histórico tem o simulado, a junção não. Isso tirava o aluno do relatório do simulado e
 * derrubava a lista de simulados com cartão (500) — achado em homol, 2026-10-12.
 *
 * Para cada linha aguardando cujo histórico JÁ tem simulado: apaga as linhas daquele histórico
 * e grava a do simulado (mesmo upsert do `registrar`). Linha cujo histórico ainda não tem
 * simulado (leitura em andamento ou falhou antes do idioma) fica como está.
 *
 * ⚠️ O simulado do histórico pode estar gravado como ObjectId ou como o DOCUMENTO inteiro (bug
 * antigo do `completeProcessing`) — lê o `_id` nos dois casos.
 *
 * Idempotente.
 */
import type { Db, ObjectId } from 'mongodb';

const JUNCAO = 'relatoriosimuladoestudantes';

export async function migrar0009(
  db: Db,
): Promise<{ aguardando: number; movidas: number; aindaSemSimulado: number }> {
  const juncao = db.collection(JUNCAO);
  const historicos = db.collection('historicos');
  const linhas = await juncao.find({ aguardandoSimulado: true }).toArray();

  let movidas = 0;
  let aindaSemSimulado = 0;
  for (const linha of linhas) {
    const h = await historicos.findOne(
      { _id: linha.historico },
      { projection: { simulado: 1 } },
    );
    const simulado = (h?.simulado?._id ?? h?.simulado) as ObjectId | undefined;
    if (!simulado) {
      aindaSemSimulado++;
      continue;
    }
    await juncao.deleteMany({ historico: linha.historico });
    await juncao.updateOne(
      { simulado, cursinhoId: linha.cursinhoId, usuario: linha.usuario },
      {
        $set: { historico: linha.historico, turmaId: linha.turmaId },
        $setOnInsert: { createdAt: linha.createdAt ?? new Date() },
      },
      { upsert: true },
    );
    movidas++;
  }
  return { aguardando: linhas.length, movidas, aindaSemSimulado };
}
