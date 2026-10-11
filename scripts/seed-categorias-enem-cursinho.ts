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
import type { Db } from 'mongodb';

const COLECAO = 'categorias';
const DONO_SYSTEM = 'system';
const DONO_CURSINHO = 'Cursinho';

const CATEGORIAS = ['Enem Dia 1', 'Enem Dia 2'];

/** Exportada para o teste; devolve os nomes criados. */
export async function semearCategoriasEnemCursinho(db: Db): Promise<string[]> {
  const criadas: string[] = [];
  const colecao = db.collection(COLECAO);

  for (const nome of CATEGORIAS) {
    const existente = await colecao.findOne({
      dono: DONO_CURSINHO,
      nome,
      deleted: { $ne: true },
    });
    if (existente) {
      console.log(`✓ "${nome}" (${DONO_CURSINHO}) já existe. Nada a fazer.`);
      continue;
    }

    const daPlataforma = await colecao.findOne({
      dono: DONO_SYSTEM,
      nome,
      deleted: { $ne: true },
    });
    if (!daPlataforma) {
      throw new Error(
        `"${nome}" da plataforma não encontrada — sem ela não há exame nem duração para copiar.`,
      );
    }
    // ⚠️ Total nulo = categoria "livre": o simulado nunca ficaria bloqueado.
    if (typeof daPlataforma.quantidadeTotalQuestao !== 'number') {
      throw new Error(
        `"${nome}" da plataforma sem quantidadeTotalQuestao — o simulado ficaria liberado incompleto.`,
      );
    }

    const agora = new Date();
    await colecao.insertOne({
      nome,
      duracao: daPlataforma.duracao,
      // ⚠️ 90 nos dois dias, e não 95 no Dia 1: este total é o do SIMULADO —
      // `bloqueado` libera o simulado quando ele tem esse número de questões, e
      // cada simulado (Inglês, Espanhol) tem 90. As 95 são do caderno da prova.
      quantidadeTotalQuestao: daPlataforma.quantidadeTotalQuestao,
      exame: daPlataforma.exame,
      // ⚠️ `custom: false`: a fábrica é escolhida pelo dono (card 02), e a
      // categoria não é "personalizada" de nenhum cursinho.
      custom: false,
      selecionavel: true,
      dono: DONO_CURSINHO,
      descricao: '',
      deleted: false,
      createdAt: agora,
      updatedAt: agora,
    });
    criadas.push(nome);
    console.log(`✓ "${nome}" (${DONO_CURSINHO}) criada.`);
  }

  return criadas;
}

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
