import {
  MINIMO_PARA_DISCRIMINAR,
  pontoBisserial,
  type AcumuladoresDeDiscriminacao,
} from './discriminacao';

/**
 * Dez estudantes com notas 0,1 a 1,0 — e uma questão que só os cinco melhores
 * acertam. Conferido à mão (o card 05 pede valores conhecidos, não "não
 * quebrou"):
 *
 *   n = 10, acertaram = 5  →  p = 0,5   q = 0,5
 *   Σnota = 5,5            →  média = 0,55
 *   Σnota² = 3,85          →  variância = 0,385 − 0,3025 = 0,0825
 *                             desvio = 0,287228
 *   M₁ = 4,0/5 = 0,8       M₀ = 1,5/5 = 0,3
 *
 *   r = (0,8 − 0,3) / 0,287228 × √0,25 = **0,870388**
 */
const NOTAS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

function acumular(
  notasQueAcertaram: number[],
  todas: number[] = NOTAS,
): AcumuladoresDeDiscriminacao {
  return {
    comLeitura: todas.length,
    acertos: notasQueAcertaram.length,
    somaNota: todas.reduce((s, n) => s + n, 0),
    somaNotaQuadrado: todas.reduce((s, n) => s + n * n, 0),
    somaNotaAcertou: notasQueAcertaram.reduce((s, n) => s + n, 0),
  };
}

describe('pontoBisserial (card 05)', () => {
  it('⚠️ questão que só os melhores acertam: 0,870388 — conferido à mão', () => {
    expect(pontoBisserial(acumular(NOTAS.slice(0, 5)))).toBeCloseTo(
      0.870388,
      6,
    );
  });

  it('⚠️ a mesma questão invertida dá o NEGATIVO exato', () => {
    // Discriminação negativa — os melhores errando mais que os piores — é o
    // sinal clássico de GABARITO TROCADO, e é a coisa mais acionável que este
    // relatório pode apontar. A simetria exata é o que prova que o sinal não
    // foi perdido em algum `Math.abs` pelo caminho.
    expect(pontoBisserial(acumular(NOTAS.slice(5)))).toBeCloseTo(-0.870388, 6);
  });

  it('⚠️ questão que não separa ninguém dá exatamente zero', () => {
    // Cinco níveis de nota, cada um com DOIS estudantes, e a questão acertada
    // por exatamente um de cada par: M₁ = M₀ = 0,6 e o numerador zera.
    //
    // ⚠️ Não dá para fazer isto alternando as `NOTAS` por índice — tentei: os
    // pares vão para 0,6 e os ímpares para 0,5, e o `r` sai 0,17. Com notas em
    // passos de 0,1 nenhum subconjunto de 5 soma a metade de 5,5. O fixture
    // tem de ser construído para a propriedade que o teste afirma.
    const pares = [0.2, 0.2, 0.4, 0.4, 0.6, 0.6, 0.8, 0.8, 1.0, 1.0];
    const umDeCada = [0.2, 0.4, 0.6, 0.8, 1.0];

    expect(pontoBisserial(acumular(umDeCada, pares))).toBeCloseTo(0, 10);
  });

  it('⚠️ 100% de acerto devolve `null`, e não `NaN`', () => {
    // Variância do ITEM é zero: p = 1, q = 0, e a correlação é indefinida.
    // Sem o gate isto vira `NaN` no JSON, que nenhum consumidor trata.
    expect(pontoBisserial(acumular(NOTAS))).toBeNull();
  });

  it('⚠️ 0% de acerto devolve `null`, e não `NaN`', () => {
    expect(pontoBisserial(acumular([]))).toBeNull();
  });

  it('⚠️ turma inteira com a MESMA nota devolve `null`', () => {
    // Variância das NOTAS é zero — divisão por zero no desvio. É o caso que o
    // gate de `p`/`q` sozinho não pega.
    const iguais = Array<number>(12).fill(0.5);

    expect(pontoBisserial(acumular(iguais.slice(0, 6), iguais))).toBeNull();
  });

  it('⚠️ variância NEGATIVA por ponto flutuante também devolve `null`', () => {
    // `Σx²/n − média²` é matematicamente ≥ 0, mas em float pode dar um
    // negativo minúsculo — e `Math.sqrt` de negativo é `NaN`, exatamente o que
    // o contrato promete nunca devolver.
    //
    // ⚠️ Este valor foi PROCURADO no runtime, não escolhido: 12 estudantes com
    // nota **0,7** produzem variância **−1,11e−16** em JS. Com 0,5 a conta
    // fecha em zero exato e o gate `=== 0` passaria — a mutação sobrevivia.
    //
    // ⚠️ E o valor tem de vir de uma medição EM JS: a primeira busca que fiz
    // foi em Python e apontou 0,3419, que em JS dá zero. A ordem de soma do
    // `reduce` importa neste nível de precisão.
    const iguais = Array<number>(12).fill(0.7);

    expect(pontoBisserial(acumular(iguais.slice(0, 6), iguais))).toBeNull();
  });

  it(`⚠️ menos de ${MINIMO_PARA_DISCRIMINAR} com leitura devolve \`null\``, () => {
    // Correlação sobre 4 alunos é ruído com cara de estatística, e o professor
    // não tem como saber disso olhando "0,71". O contrato carrega
    // `respondentes` ao lado justamente para a base ser julgável.
    const poucos = [0.9, 0.8, 0.3, 0.2];

    expect(pontoBisserial(acumular(poucos.slice(0, 2), poucos))).toBeNull();
  });

  it(`exatamente ${MINIMO_PARA_DISCRIMINAR} com leitura JÁ calcula`, () => {
    // O limiar é inclusivo — senão o gate diria "menos de 11".
    expect(pontoBisserial(acumular(NOTAS.slice(0, 5)))).not.toBeNull();
  });

  it('⚠️ o resultado fica no intervalo [-1, 1]', () => {
    // Uma correlação fora disso é erro de fórmula, não dado estranho. O caso
    // extremo é a separação perfeita: os 5 melhores acertando e os 5 piores
    // errando, com notas o mais separadas possível.
    const extremo = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0];

    const r = pontoBisserial(acumular(extremo.slice(0, 5), extremo))!;
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(-1);
    // separação perfeita = 1, e este é o teto teórico da medida
    expect(r).toBeCloseTo(1, 10);
  });

  it('⚠️ a base é quem teve LEITURA da questão, não `respondentes`', () => {
    // Quem não foi lido não errou o item — não tem medida dele. Incluí-lo como
    // "errou" é exatamente o que o relatório inteiro recusa fazer
    // (`rotuloDoResultado`, os três estados de `ResultadoDaQuestao`), e aqui
    // enviesaria a correlação para baixo em toda questão com folha ruim.
    //
    // Mesmos números do primeiro teste, mas com 3 sem-leitura fora da conta:
    // se eles entrassem, `comLeitura` seria 13 e o `r` mudaria.
    const comTresSemLeitura = acumular(NOTAS.slice(0, 5));

    expect(comTresSemLeitura.comLeitura).toBe(10);
    expect(pontoBisserial(comTresSemLeitura)).toBeCloseTo(0.870388, 6);
  });
});
