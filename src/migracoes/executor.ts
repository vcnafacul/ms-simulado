import { hostname } from 'os';
import type { Db } from 'mongodb';
import { Passo } from './registro';

/** Onde fica o que já rodou neste ambiente — uma linha por migração e por seed. */
export const COLECAO_REGISTRO = '_migracoes';
const COLECAO_TRAVA = '_migracoes_trava';
/** Uma execução travada que morreu no meio libera a trava sozinha depois disto. */
const VALIDADE_DA_TRAVA_MS = 10 * 60 * 1000;

type Log = (linha: string) => void;

export interface ResultadoDaExecucao {
  aplicadas: string[];
  jaAplicadas: string[];
  seeds: { id: string; ok: boolean; resultado: string }[];
}

/**
 * Roda as migrações que faltam neste ambiente (em ordem, uma vez cada) e todos os seeds.
 *
 * ⚠️ Uma execução por vez, por banco: a trava em `_migracoes_trava` impede que duas instâncias
 * subindo juntas rodem a mesma migração em paralelo.
 * ⚠️ Migração que falha PARA tudo (lança), sem registrar — roda de novo no próximo deploy.
 */
export async function rodarMigracoes(
  db: Db,
  passos: { migracoes: Passo[]; seeds: Passo[] },
  log: Log = (l) => console.log(l),
): Promise<ResultadoDaExecucao> {
  const quem = `${hostname()}:${process.pid}`;
  await travar(db, quem);
  try {
    const registro = db.collection<{ _id: string } & Record<string, unknown>>(
      COLECAO_REGISTRO,
    );
    const feitas = new Set(
      (
        await registro
          .find({ tipo: 'migracao' }, { projection: { _id: 1 } })
          .toArray()
      ).map((d) => d._id),
    );

    const resultado: ResultadoDaExecucao = {
      aplicadas: [],
      jaAplicadas: [],
      seeds: [],
    };

    for (const m of passos.migracoes) {
      if (feitas.has(m.id)) {
        resultado.jaAplicadas.push(m.id);
        continue;
      }
      log(`→ migração ${m.id}: ${m.descricao}`);
      const inicio = Date.now();
      const saida = await m.executar(db);
      await registro.insertOne({
        _id: m.id,
        tipo: 'migracao',
        descricao: m.descricao,
        aplicadaEm: new Date(),
        duracaoMs: Date.now() - inicio,
        resultado: resumo(saida),
        por: quem,
      });
      resultado.aplicadas.push(m.id);
      log(`  ✓ ${m.id} (${Date.now() - inicio} ms) — ${resumo(saida)}`);
    }

    for (const s of passos.seeds) {
      let ok = true;
      let texto: string;
      try {
        texto = resumo(await s.executar(db));
      } catch (err) {
        ok = false;
        texto = err instanceof Error ? err.message : String(err);
      }
      await registro.updateOne(
        { _id: s.id },
        {
          $set: {
            tipo: 'seed',
            descricao: s.descricao,
            ultimaExecucaoEm: new Date(),
            ok,
            resultado: texto,
            por: quem,
          },
        },
        { upsert: true },
      );
      resultado.seeds.push({ id: s.id, ok, resultado: texto });
      log(`  ${ok ? '✓' : '⚠️'} ${s.id} — ${texto}`);
    }

    return resultado;
  } finally {
    await db
      .collection(COLECAO_TRAVA)
      .deleteOne({ _id: 'trava', por: quem } as never);
  }
}

function resumo(saida: unknown): string {
  if (saida === undefined || saida === null) return 'ok';
  return typeof saida === 'string' ? saida : JSON.stringify(saida);
}

/**
 * ⚠️ `upsert` com o filtro "livre ou vencida": se outra instância segura uma trava válida, o
 * upsert tenta INSERIR `_id: 'trava'` de novo e o Mongo recusa (11000) — é isso que diz
 * "ocupado". Espera um pouco e tenta de novo; desiste depois de um tempo.
 */
async function travar(db: Db, quem: string): Promise<void> {
  const col = db.collection(COLECAO_TRAVA);
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    const agora = new Date();
    try {
      await col.updateOne(
        { _id: 'trava', ate: { $lt: agora } } as never,
        {
          $set: {
            ate: new Date(agora.getTime() + VALIDADE_DA_TRAVA_MS),
            por: quem,
          },
        },
        { upsert: true },
      );
      return;
    } catch (err) {
      if ((err as { code?: number })?.code !== 11000) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(
    'outra execução das migrações está em andamento há mais de 2 min',
  );
}
