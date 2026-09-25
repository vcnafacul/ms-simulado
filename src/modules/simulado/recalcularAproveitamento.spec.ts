import { calcularAproveitamento } from './calcularAproveitamento';
import { recalcularAproveitamento } from './recalcularAproveitamento';

const materia = { _id: 'm-mat', nome: 'Matemática' };
const frente = (nome: string) => ({ _id: `f-${nome}`, nome, materia });
const questao = (id: string, ...frentes: ReturnType<typeof frente>[]): any => {
  const q: any = {
    _id: { toString: () => id },
    alternativa: 'A',
    materia,
  };
  frentes.forEach((f, i) => (q[`frente${i + 1}`] = f));
  return q;
};

// O caso do QA: 2 questões de Matemática, uma com 3 frentes.
const QUESTOES = [
  questao('q1', frente('Álgebra')),
  questao('q2', frente('Financeira'), frente('Álgebra'), frente('Estatística')),
];
const RAW = [{ questao: 'q2', alternativaEstudante: 'A' }];

/** O que o cálculo ANTIGO gravou: Matemática com 4 questões e 3/4 de acerto. */
const GRAVADO_ERRADO: any = {
  geral: 0.5,
  materias: [
    {
      id: 'm-mat',
      nome: 'Matemática',
      aproveitamento: 0.75,
      questoes: 4,
      frentes: [],
    },
  ],
};

describe('recalcularAproveitamento (contagem-por-materia 02)', () => {
  it('⚠️ o gravado errado muda para Matemática 1 de 2', () => {
    const { novo, mudou } = recalcularAproveitamento(
      GRAVADO_ERRADO,
      QUESTOES,
      RAW,
    );

    expect(mudou).toBe(true);
    expect(novo.materias[0]).toMatchObject({
      questoes: 2,
      aproveitamento: 0.5,
    });
  });

  it('⚠️ idempotente: recalcular o que já foi recalculado não muda nada', () => {
    const { novo } = recalcularAproveitamento(GRAVADO_ERRADO, QUESTOES, RAW);

    expect(recalcularAproveitamento(novo, QUESTOES, RAW).mudou).toBe(false);
  });

  it('ordem diferente das matérias e ruído de ponto flutuante não contam como mudança', () => {
    const certo = calcularAproveitamento([]);
    const outro = {
      ...certo,
      materias: [...certo.materias].reverse(),
      geral: certo.geral + 1e-12,
    };

    expect(recalcularAproveitamento(outro, [], []).mudou).toBe(false);
  });

  it('histórico antigo sem a base (`questoes`) é regravado — ganha a base', () => {
    const { novo } = recalcularAproveitamento(null, QUESTOES, RAW);
    const semBase = JSON.parse(JSON.stringify(novo));
    delete semBase.materias[0].questoes;

    expect(recalcularAproveitamento(semBase, QUESTOES, RAW).mudou).toBe(true);
  });
});
