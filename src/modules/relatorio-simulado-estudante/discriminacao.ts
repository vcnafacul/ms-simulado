/**
 * Abaixo disto, `null` em vez de número.
 *
 * ⚠️ Correlação sobre 4 alunos é ruído com cara de estatística, e o professor
 * não tem como saber disso olhando "0,71". O contrato carrega `respondentes` ao
 * lado justamente para a base ser julgável — mesma postura do
 * `percentualDeAcerto`, que devolve `null` sem base, e do `indiceDeDificuldade`,
 * que anda sempre com a base junto.
 */
export const MINIMO_PARA_DISCRIMINAR = 10;

/**
 * O que a agregação acumula numa passada, por questão.
 *
 * ⚠️ **`comLeitura` é quem teve LEITURA da questão — não `respondentes`.** Quem
 * não foi lido não errou o item: não há medida dele. Contá-lo como "errou" é
 * exatamente o que o relatório inteiro recusa fazer (ver `rotuloDoResultado` e
 * os três estados de `ResultadoDaQuestao`), e aqui enviesaria a correlação para
 * baixo em toda questão que caiu numa folha mal fotografada — punindo o item
 * pela qualidade da foto.
 */
export interface AcumuladoresDeDiscriminacao {
  /** Quantos estudantes tiveram a questão lida (acerto ou erro). */
  comLeitura: number;
  /** Quantos desses acertaram. */
  acertos: number;
  /** Σ nota geral. */
  somaNota: number;
  /** Σ nota geral². */
  somaNotaQuadrado: number;
  /** Σ nota geral de quem acertou. */
  somaNotaAcertou: number;
}

/**
 * A correlação ponto-bisserial entre acertar a questão e a nota da prova.
 *
 * Responde a pergunta que a dificuldade sozinha não responde: **"22% acertaram"
 * é uma questão difícil e boa, ou uma questão quebrada?** No primeiro caso os
 * 22% são quem foi bem na prova inteira; no segundo, quem chutou. As ações são
 * opostas — dar aula do conteúdo, ou corrigir o item e desconsiderá-lo.
 *
 * ⚠️ **Negativo é o sinal clássico de gabarito trocado**: os melhores alunos
 * errando mais que os piores. É a coisa mais acionável que um relatório de
 * questões pode apontar.
 *
 * ```
 *          M₁ − M₀
 *   r_pb = ─────── × √(p·q)
 *             s
 * ```
 *
 * `M₁`/`M₀` = nota média de quem acertou / errou · `s` = desvio populacional
 * das notas · `p`/`q` = proporção que acertou / errou.
 *
 * ⚠️ **Ponto-bisserial, e não o D de Kelley (27%).** O card 03 da série
 * anterior registrou a escala real: de 30 a 500 estudantes. Com 30, os grupos
 * de 27% têm **8 pessoas cada** e o D vira ruído; o ponto-bisserial usa os 30.
 *
 * ⚠️ **Sem correção de *corrected item-total*, e isto é decisão, não
 * esquecimento.** `aproveitamento.geral` inclui a própria questão, o que infla
 * levemente a correlação. A correção padrão desconta o item do total; com
 * 45–180 questões o viés é de ordem `1/n` (≤ 2%) e não muda faixa nenhuma das
 * que o card 06 exibe. Se a contagem de questões por simulado cair para algo
 * como 10, isto tem de ser revisto.
 *
 * ⚠️ **Depende da definição de `aproveitamento.geral`.** Hoje "sem leitura"
 * entra nela como erro; o card 13 propõe mudar isso, e quando mudar a
 * discriminação muda junto — os testes daqui têm de ser revisitados.
 *
 * ⚠️ Devolve `null`, nunca `NaN`, nos três casos degenerados: base pequena,
 * variância do item zero (todos acertaram ou ninguém acertou) e variância das
 * notas zero (turma toda com a mesma nota).
 */
export function pontoBisserial(
  acc: AcumuladoresDeDiscriminacao,
): number | null {
  const {
    comLeitura: n,
    acertos,
    somaNota,
    somaNotaQuadrado,
    somaNotaAcertou,
  } = acc;

  if (n < MINIMO_PARA_DISCRIMINAR) return null;

  // ⚠️ Variância do ITEM zero: a correlação é indefinida, não zero. `p = 1` ou
  // `p = 0` produziria `√0 = 0` no fator e uma divisão por zero em `M₀`/`M₁`.
  if (acertos === 0 || acertos === n) return null;

  const media = somaNota / n;
  // Variância POPULACIONAL (divide por n, não n−1): a turma é a população
  // inteira do recorte, não uma amostra dela — e é a convenção do ponto-bisserial.
  const variancia = somaNotaQuadrado / n - media * media;

  // ⚠️ `<= 0`, e não `=== 0`: subtração de quadrados grandes pode dar um
  // negativo minúsculo por erro de ponto flutuante, e `Math.sqrt` de negativo
  // é `NaN` — exatamente o que este gate existe para impedir.
  if (variancia <= 0) return null;

  const mediaAcertou = somaNotaAcertou / acertos;
  const mediaErrou = (somaNota - somaNotaAcertou) / (n - acertos);
  const p = acertos / n;

  return (
    ((mediaAcertou - mediaErrou) / Math.sqrt(variancia)) *
    Math.sqrt(p * (1 - p))
  );
}
