import { recalcularHistorico } from './recalcularHistorico';

const id = (s: string) => ({ toString: () => s });
const q = (i: string, alternativa = 'A') =>
  ({
    _id: id(i),
    alternativa,
    materia: { _id: id('m'), nome: 'Mat' },
    frente1: {
      _id: id('f'),
      nome: 'Álgebra',
      materia: { _id: id('m'), nome: 'Mat' },
    },
  }) as any;
const r = (
  questao: string,
  numero: number | null,
  marcada?: string,
  correta = 'A',
) => ({
  questao,
  numero,
  alternativaEstudante: marcada,
  alternativaCorreta: correta,
});

describe('recalcularHistorico (042/10 e 12)', () => {
  it('tira a anulada do numerador e do denominador, com o gabarito GRAVADO', () => {
    const slots = [
      { questao: q('q1', 'B'), numero: 1 }, // gabarito de hoje mudou; vale o gravado (A)
      { questao: q('q2'), numero: 2, anulacao: {} },
      { questao: q('q3'), numero: 3 },
    ];
    const res = recalcularHistorico(
      [r('q1', 1, 'A'), r('q2', 2, 'A'), r('q3', 3, 'C')],
      slots,
      4,
      new Date('2026-10-18T00:00:00Z'),
    );
    expect(res.ok).toBe(true);
    expect(res.dados).toMatchObject({
      acertos: 1,
      questoesRespondidas: 2,
      totalConsiderado: 2,
      numerosAnulados: [2],
      revisaoAnulacao: 4,
      recalculadoEm: new Date('2026-10-18T00:00:00Z'),
    });
    expect(res.dados!.aproveitamento.geral).toBe(0.5);
    expect(res.dados!.respostas.map((x) => !!x.anulada)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('⚠️ casa pelo NÚMERO: sucessora no slot, histórico com a original → mantém o acerto e o id gravado', () => {
    const res = recalcularHistorico(
      [r('original', 1, 'A'), r('q2', 2, 'A')],
      [
        { questao: q('sucessora'), numero: 1 },
        { questao: q('q2'), numero: 2 },
      ],
      1,
    );
    expect(res.dados!.acertos).toBe(2);
    expect(res.dados!.respostas[0].questao).toBe('original');
  });

  it('histórico antigo, sem `numero` gravado: casa pelo id e preenche o número', () => {
    const res = recalcularHistorico(
      [r('q1', null, 'A'), r('q2', null, 'B')],
      [
        { questao: q('q1'), numero: 7 },
        { questao: q('q2'), numero: 8, anulacao: {} },
      ],
      1,
    );
    expect(res.dados).toMatchObject({
      acertos: 1,
      totalConsiderado: 1,
      numerosAnulados: [8],
    });
    expect(res.dados!.respostas.map((x) => x.numero)).toEqual([7, 8]);
  });

  it('slot sem resposta gravada (entrou depois) → não recalcula, com o motivo', () => {
    const res = recalcularHistorico(
      [r('q1', 1, 'A')],
      [
        { questao: q('q1'), numero: 1 },
        { questao: q('nova'), numero: 2 },
      ],
      1,
    );
    expect(res).toEqual({
      ok: false,
      motivo: 'questão 2 sem resposta gravada',
    });
  });

  it('desanular + recalcular → a nota de antes', () => {
    const gravadas = [r('q1', 1, 'A'), r('q2', 2, 'B')];
    const slots = [
      { questao: q('q1'), numero: 1 },
      { questao: q('q2'), numero: 2 },
    ];
    const res = recalcularHistorico(gravadas, slots, 2);
    expect(res.dados).toMatchObject({
      acertos: 1,
      totalConsiderado: 2,
      numerosAnulados: [],
    });
    expect(res.dados!.aproveitamento.geral).toBe(0.5);
  });
});
