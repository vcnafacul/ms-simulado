/**
 * Migração 0007 — histórico com prova (tickets/038, card 05). Detalhes e rollback:
 * `scripts/migrations/0007-historico-prova/README.md`.
 *
 * Idempotente. Roda sozinha no deploy (`src/migracoes`) ou à mão (`yarn migracao:0007`).
 */
import type { Db, ObjectId } from 'mongodb';

export const NOME_DO_INDICE = 'cartao_da_prova_por_estudante';
export const INDICE_V1 = 'cartao_por_estudante';
export const INDICE_V2 = 'cartao_por_estudante_v2';

export interface ResultadoMigracao {
  historicosSemProva: number;
  preenchidos: number;
  simuladosSemProva: number;
  indice: boolean;
  indiceV2: boolean;
  indiceV1: boolean;
}

export async function migrar0007(
  db: Db,
  aplicar: boolean,
): Promise<ResultadoMigracao> {
  const historicos = db.collection('historicos');
  const provas = db.collection('provas');

  const simuladoIds = (await historicos.distinct('simulado', {
    cartaoCode: { $type: 'string' },
    simulado: { $type: 'objectId' },
    $or: [{ prova: { $exists: false } }, { prova: null }],
  })) as ObjectId[];

  let historicosSemProva = 0;
  let preenchidos = 0;
  let simuladosSemProva = 0;
  for (const simulado of simuladoIds) {
    const filtro = {
      simulado,
      cartaoCode: { $type: 'string' },
      $or: [{ prova: { $exists: false } }, { prova: null }],
    };
    historicosSemProva += await historicos.countDocuments(filtro);
    // A mais antiga, se houver mais de uma — mesma regra do
    // `ProvaRepository.buscarProvaDoSimulado`.
    const prova = await provas.findOne(
      { simulados: simulado, deleted: { $ne: true } },
      { sort: { _id: 1 }, projection: { _id: 1 } },
    );
    if (!prova) {
      simuladosSemProva++;
      continue;
    }
    if (aplicar) {
      const r = await historicos.updateMany(filtro, {
        $set: { prova: prova._id },
      });
      preenchidos += r.modifiedCount;
    }
  }

  if (aplicar) {
    /*
      v2 = v1 + `prova` na chave. Como a chave nova contém a antiga, não há
      duplicado possível; cria a v2 ANTES de apagar a v1 para nunca ficar sem
      a trava.
    */
    await historicos.createIndex(
      { usuario: 1, simulado: 1, prova: 1, cartaoCode: 1 },
      {
        unique: true,
        name: INDICE_V2,
        partialFilterExpression: { cartaoCode: { $type: 'string' } },
      },
    );
    if ((await historicos.indexes()).some((i) => i.name === INDICE_V1)) {
      await historicos.dropIndex(INDICE_V1);
    }
    await historicos.createIndex(
      { usuario: 1, prova: 1 },
      {
        unique: true,
        name: NOME_DO_INDICE,
        partialFilterExpression: { cartaoDaProva: true },
      },
    );
  }
  const nomes = (await historicos.indexes()).map((i) => i.name);
  return {
    historicosSemProva,
    preenchidos,
    simuladosSemProva,
    indice: nomes.includes(NOME_DO_INDICE),
    indiceV2: nomes.includes(INDICE_V2),
    indiceV1: nomes.includes(INDICE_V1),
  };
}
