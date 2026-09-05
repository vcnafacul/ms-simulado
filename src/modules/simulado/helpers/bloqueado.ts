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
 * Uma prova/simulado só pode ficar "pronto" (bloqueado = false) se toda
 * questão do container já tem número atribuído. Sem essa checagem, uma
 * questão aprovada mas sem número (numero: null) deixaria a prova/simulado
 * desbloquear e o cartão-resposta seria gerado com layout corrompido
 * (Math.min de um array com null vira NaN — ver template-provision.service.ts).
 * No fluxo do aluno o mesmo `null` deixaria a questão inalcançável, já que o
 * número é a identidade da questão ativa.
 */
export function todasNumeradas(questoes: { numero: number | null }[]): boolean {
  return questoes.every((q) => q.numero != null);
}

/** Entry questão↔container, na forma mínima que o cálculo de bloqueio exige. */
interface QuestaoNoContainer {
  questao: { _id?: { toString(): string }; status?: Status };
  numero: number | null;
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
  return !(atingiu && todasAprovadas && todasNumeradas(simulado.questoes));
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
