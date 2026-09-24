/**
 * O que a questão é em relação à sua `origem` (card 32).
 *
 * ⚠️ **Significados OPOSTOS, e por isso não podem dividir o campo sem tipo:**
 *
 * - `copia` (card 25) — uma questão IRMÃ: "quero outra parecida". As provas
 *   não mudam, e a cópia nasce do zero, sem histórico anterior.
 * - `versao` (card 26) — a SUCESSORA: substituiu a original em todas as provas
 *   e simulados, e a original congelou com o histórico de quem já respondeu.
 */
export enum TipoOrigem {
  copia = 'copia',
  versao = 'versao',
}
