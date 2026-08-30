import { ClientSession, Types } from 'mongoose';
import { revalidarBloqueado } from '../../simulado/helpers/bloqueado';
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
 * Normaliza o id da questão de uma entry, funcionando tanto com objeto completo
 * (`qc.questao._id`, populado) quanto com ref crua (`qc.questao` = ObjectId).
 */
export function resolveQuestaoId(qc: QuestaoNaContainer): string {
  const q = qc.questao as any;
  return (q?._id ?? q).toString();
}

/**
 * Remove do container a entry cuja questão bate com `questaoId`.
 */
export function removeQuestaoFromContainer(
  container: QuestaoContainer,
  questaoId: Types.ObjectId | string,
): void {
  const idStr = questaoId.toString();
  container.questoes = container.questoes.filter(
    (qc) => resolveQuestaoId(qc) !== idStr,
  );
}

/** Container que carrega estado de bloqueio (só Simulado, não Prova). */
interface SimuladoContainer extends QuestaoContainer {
  categoria: { quantidadeTotalQuestao?: number | null };
  bloqueado?: boolean;
}

interface ProvaRepositoryLike {
  getById(
    id: string,
  ): Promise<QuestaoContainer & { simulados: SimuladoContainer[] }>;
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
 *
 * Cada simulado que muda é revalidado: `numero` entra na regra de bloqueio, e
 * sem isso remover um número deixaria um simulado liberado com questão sem
 * posição, e preencher o número que faltava não liberaria o simulado travado
 * só por causa dele.
 */
export async function syncNumeroNaProvaESimulados(
  provaRepository: ProvaRepositoryLike,
  simuladoRepository: SimuladoRepositoryLike,
  provaId: string,
  questaoId: Types.ObjectId | string,
  numero: number | null,
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
        revalidarBloqueado(sml);
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
  numero: number | null,
): boolean {
  const idStr = questaoId.toString();
  let changed = false;
  for (const qc of container.questoes) {
    if (resolveQuestaoId(qc) === idStr && qc.numero !== numero) {
      qc.numero = numero;
      changed = true;
    }
  }
  return changed;
}
