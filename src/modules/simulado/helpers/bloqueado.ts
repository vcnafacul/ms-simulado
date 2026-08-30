import { Status } from '../../questao/enums/status.enum';

/**
 * Um simulado "atingiu a quantidade-alvo" quando a categoria é livre
 * (`quantidadeTotalQuestao == null`, introduzida pelas categorias custom da
 * etapa 3) OU quando o total de questões bate exatamente com o alvo numérico.
 *
 * Usado no cálculo de `Simulado.bloqueado` em vários pontos (addQuestionSimulados,
 * approvedQuestion, refuseQuestion, executeSync). Antes desta regra, o `null`
 * nunca satisfazia `length === null`, então simulados custom nunca desbloqueavam.
 */
export function atingiuQuantidade(
  quantidadeTotalQuestao: number | null | undefined,
  count: number,
): boolean {
  return quantidadeTotalQuestao == null || count === quantidadeTotalQuestao;
}

/**
 * Um simulado só pode ser liberado quando toda questão dele tem posição
 * definida. `numero` vive no vínculo questão↔container e passou a aceitar
 * `null` (questão na prova, ainda sem posição) — mas o fluxo do aluno usa o
 * número como identidade da questão ativa, então um `null` ali deixaria a
 * questão inalcançável na prova ao vivo. Esta é a terceira condição do
 * desbloqueio, ao lado de `atingiuQuantidade` e de todas aprovadas.
 */
export function todasComNumero(
  questoes: { numero?: number | null }[],
): boolean {
  return questoes.every((qc) => qc.numero != null);
}

/** Entry questão↔container, na forma mínima que o cálculo de bloqueio exige. */
interface QuestaoNoContainer {
  questao: { _id?: { toString(): string }; status?: Status };
  numero?: number | null;
}

/** Simulado na forma mínima que o cálculo de bloqueio exige. */
export interface SimuladoBloqueavel {
  categoria: { quantidadeTotalQuestao?: number | null };
  questoes: QuestaoNoContainer[];
  bloqueado?: boolean;
}

/**
 * Questão cujo status novo ainda não foi persistido (fluxos de aprovar/rejeitar
 * recalculam o bloqueio antes do write). O cálculo precisa considerá-la à parte
 * do que está no documento.
 */
export interface QuestaoEmTransito {
  questaoId: string;
  aprovada: boolean;
}

/**
 * Regra única de bloqueio: um simulado só é liberado quando atinge a quantidade
 * da categoria, tem todas as questões aprovadas e todas numeradas. Pura — não
 * toca no documento. Use `revalidarBloqueado` para aplicar o resultado.
 */
export function calcularBloqueado(
  simulado: SimuladoBloqueavel,
  emTransito?: QuestaoEmTransito,
): boolean {
  const atingiu = atingiuQuantidade(
    simulado.categoria?.quantidadeTotalQuestao,
    simulado.questoes.length,
  );
  const todasAprovadas = simulado.questoes.every((qc) => {
    if (emTransito && qc.questao._id?.toString() === emTransito.questaoId) {
      return emTransito.aprovada;
    }
    return qc.questao.status === Status.Approved;
  });
  return !(atingiu && todasAprovadas && todasComNumero(simulado.questoes));
}

/**
 * Aplica a regra ao documento e devolve o novo `bloqueado`. Todo caminho que
 * mexe em algo que entra na regra (status, quantidade de questões, numero)
 * precisa chamar isto — senão o simulado fica com um `bloqueado` obsoleto.
 *
 * Ao liberar, ordena as questões por `numero`: o fluxo do aluno usa a ordem do
 * container, e aqui já sabemos que todas estão numeradas (a subtração é segura).
 */
export function revalidarBloqueado(
  simulado: SimuladoBloqueavel,
  emTransito?: QuestaoEmTransito,
): boolean {
  simulado.bloqueado = calcularBloqueado(simulado, emTransito);
  if (!simulado.bloqueado) {
    simulado.questoes.sort((a, b) => a.numero - b.numero);
  }
  return simulado.bloqueado;
}
