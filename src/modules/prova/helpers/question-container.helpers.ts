import { Types } from 'mongoose';
import { Questao } from '../../questao/questao.schema';
import { QuestaoNaContainer } from '../schemas/questao-na-container.schema';

interface QuestaoContainer {
  questoesNovo: QuestaoNaContainer[];
}

/**
 * Adiciona a questão ao container (Prova ou Simulado) escrevendo SÓ em
 * `questoesNovo` (cutover, single-write). Guarda o objeto Questao completo —
 * o Mongoose casta para `_id` na persistência, e em memória preserva a leitura
 * de `qc.questao.status`/`.numero` usada nas factories/addQuestionSimulados.
 */
export function addQuestaoToContainer(
  container: QuestaoContainer,
  questao: Questao,
): void {
  container.questoesNovo.push({ questao, numero: questao.numero });
}

/**
 * Remove do container a entry cuja questão bate com `questaoId`. Normaliza o id
 * para funcionar tanto com objeto completo (`qc.questao._id`) quanto com ref
 * crua (`qc.questao` sendo o próprio ObjectId).
 */
export function removeQuestaoFromContainer(
  container: QuestaoContainer,
  questaoId: Types.ObjectId,
): void {
  const idStr = questaoId.toString();
  container.questoesNovo = container.questoesNovo.filter((qc) => {
    const cur = (qc.questao as any)?._id ?? qc.questao;
    return cur.toString() !== idStr;
  });
}
