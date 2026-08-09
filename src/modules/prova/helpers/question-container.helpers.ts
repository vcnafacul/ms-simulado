import { ClientSession, Types } from 'mongoose';
import { Questao } from '../../questao/questao.schema';
import { QuestaoNaContainer } from '../schemas/questao-na-container.schema';

interface QuestaoContainer {
  questoes: QuestaoNaContainer[];
}

/**
 * Adiciona a questão ao container (Prova ou Simulado) escrevendo SÓ em
 * `questoes` (cutover, single-write). Guarda o objeto Questao completo —
 * o Mongoose casta para `_id` na persistência, e em memória preserva a leitura
 * de `qc.questao.status`/`.numero` usada nas factories/addQuestionSimulados.
 */
export function addQuestaoToContainer(
  container: QuestaoContainer,
  questao: Questao,
  numero: number,
): void {
  container.questoes.push({ questao, numero });
}

/**
 * Remove do container a entry cuja questão bate com `questaoId`. Normaliza o id
 * para funcionar tanto com objeto completo (`qc.questao._id`) quanto com ref
 * crua (`qc.questao` sendo o próprio ObjectId).
 */
export function removeQuestaoFromContainer(
  container: QuestaoContainer,
  questaoId: Types.ObjectId | string,
): void {
  const idStr = questaoId.toString();
  container.questoes = container.questoes.filter((qc) => {
    const cur = (qc.questao as any)?._id ?? qc.questao;
    return cur.toString() !== idStr;
  });
}

interface ProvaRepositoryLike {
  getById(id: string): Promise<QuestaoContainer & { simulados: QuestaoContainer[] }>;
  update(prova: QuestaoContainer, session?: ClientSession): Promise<unknown>;
}
interface SimuladoRepositoryLike {
  update(simulado: QuestaoContainer, session?: ClientSession): Promise<unknown>;
}

/**
 * Sincroniza o `numero` de uma questão no container da prova e em cada simulado
 * dela. Escopo intencional (Etapa 9): só a prova informada + seus simulados —
 * número vive no relacionamento, não propaga a outras provas. Idempotente:
 * `updateNumeroNoContainer` é no-op quando o número já está correto, então só
 * persiste os containers que de fato mudaram.
 *
 * `session` opcional: quando chamado dentro de uma transação (factories), os
 * updates entram na mesma session — assim uma falha aqui aborta a transação em
 * vez de deixar o `numero` dessincronizado pós-commit. Sem session (ex.:
 * updateClassificacao) roda solto, como antes.
 */
export async function syncNumeroNaProvaESimulados(
  provaRepository: ProvaRepositoryLike,
  simuladoRepository: SimuladoRepositoryLike,
  provaId: string,
  questaoId: Types.ObjectId | string,
  numero: number,
  session?: ClientSession,
): Promise<void> {
  const prova = await provaRepository.getById(provaId);
  if (!prova) return;
  if (updateNumeroNoContainer(prova, questaoId, numero)) {
    await provaRepository.update(prova, session);
  }
  await Promise.all(
    (prova.simulados ?? []).map(async (sml) => {
      if (updateNumeroNoContainer(sml, questaoId, numero)) {
        await simuladoRepository.update(sml, session);
      }
    }),
  );
}

/**
 * Atualiza in-place o `numero` das entries que referenciam `questaoId`.
 * Usado no cutover: `numero` vive no subdoc, então editar o número de uma
 * questão exige reconciliar os containers (prova + simulados). Retorna se
 * alguma entry mudou (pra evitar persistência desnecessária).
 */
export function updateNumeroNoContainer(
  container: QuestaoContainer,
  questaoId: Types.ObjectId | string,
  numero: number,
): boolean {
  const idStr = questaoId.toString();
  let changed = false;
  for (const qc of container.questoes) {
    const cur = (qc.questao as any)?._id ?? qc.questao;
    if (cur.toString() === idStr && qc.numero !== numero) {
      qc.numero = numero;
      changed = true;
    }
  }
  return changed;
}
