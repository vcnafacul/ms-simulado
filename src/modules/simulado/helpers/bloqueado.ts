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
