/**
 * Migração 0007 — histórico com prova (tickets/038, card 05).
 *
 * 1. Preenche `historicos.prova` nos históricos de CARTÃO (`cartaoCode`
 *    string) que ainda não a têm, pela prova viva que contém o simulado.
 *    Simulado sem prova (7 de 134 em homol, 2026-10-10) → fica sem, e é
 *    contado.
 * 2. Troca o `cartao_por_estudante` pelo `_v2` ({usuario, simulado, prova,
 *    cartaoCode}): com o simulado vazio até o callback, dois cartões da prova
 *    do mesmo aluno em provas diferentes colidiam no v1.
 * 3. Cria o índice `cartao_da_prova_por_estudante` ({usuario, prova}, único,
 *    parcial em `cartaoDaProva: true`). ⚠️ Pela migração e não só pelo
 *    `autoIndex`, que falha calado (ver a 0006).
 *
 * Uso:
 *   MONGODB='mongodb://...' yarn migracao:0007            # só CONTA
 *   MONGODB='mongodb://...' yarn migracao:0007 --aplicar  # preenche e cria o índice
 *
 * Idempotente: a segunda rodada não acha nada para preencher.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
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

  const r = await migrar0007(db, aplicar);
  console.log(`históricos de cartão sem prova: ${r.historicosSemProva}`);
  console.log(
    `simulados (com cartão) que não estão em prova: ${r.simuladosSemProva}`,
  );
  if (aplicar) {
    console.log(`preenchidos: ${r.preenchidos}`);
    if (!r.indice) throw new Error(`índice ${NOME_DO_INDICE} não criado`);
    if (!r.indiceV2 || r.indiceV1) {
      throw new Error(`troca ${INDICE_V1} → ${INDICE_V2} não concluída`);
    }
    console.log(
      `índices ${NOME_DO_INDICE} e ${INDICE_V2} OK (${INDICE_V1} removido)`,
    );
    console.log('migração 0007 OK');
  } else {
    console.log('modo CONTAGEM — nada foi escrito. Para aplicar: --aplicar');
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
