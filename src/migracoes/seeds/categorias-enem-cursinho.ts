/**
 * Seed — tickets/038, card 01 (R1): "Enem Dia 1" e "Enem Dia 2" com `dono = Cursinho`.
 *
 * ⚠️ Idempotente: categoria viva com o mesmo `{dono, nome}` já existe → pula. Roda em todo
 * deploy (`src/migracoes`) ou à mão (`yarn seed:categorias-enem-cursinho`).
 * ⚠️ `exame`, `duracao` e `quantidadeTotalQuestao` vêm das "Enem Dia 1/2" da PLATAFORMA; sem
 * elas, para com erro em vez de inventar um exame.
 */
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
