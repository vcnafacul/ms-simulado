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
 */
export function todasNumeradas(questoes: { numero: number | null }[]): boolean {
  return questoes.every((q) => q.numero != null);
}
