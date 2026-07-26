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
