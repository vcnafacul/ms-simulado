import { Status } from '../../questao/enums/status.enum';
import { atualizacoesDaProva } from './atualizacoes-da-prova';

/** tickets/023, card 13 — o algoritmo, com as fontes de mentira. */
describe('atualizacoesDaProva', () => {
  const doc = (id: string, o: object = {}) => ({
    _id: id,
    status: Status.Approved,
    congelada: false,
    ...o,
  });

  it('⚠️ sem N+1: uma consulta por NÍVEL, não por questão', async () => {
    // 3 questões congeladas, cada uma com cadeia de 2 versões.
    const questoes = jest.fn(async () =>
      ['a', 'b', 'c'].map((id) => doc(id, { congelada: true })),
    );
    const cadeia: Record<string, ReturnType<typeof doc>> = {
      a: doc('a1', { congelada: true }),
      b: doc('b1', { congelada: true }),
      c: doc('c1', { congelada: true }),
      a1: doc('a2'),
      b1: doc('b2'),
      c1: doc('c2'),
    };
    const sucessoras = jest.fn(
      async (ids: string[]) =>
        new Map(ids.filter((i) => cadeia[i]).map((i) => [i, cadeia[i]])),
    );

    const r = await atualizacoesDaProva(
      ['a', 'b', 'c'].map((questaoId, i) => ({ numero: i + 1, questaoId })),
      { questoes, sucessoras },
    );

    expect(questoes).toHaveBeenCalledTimes(1);
    expect(sucessoras).toHaveBeenCalledTimes(2); // 2 níveis
    expect(r.map((x) => x.oferta._id)).toEqual(['a2', 'b2', 'c2']);
  });

  it('⚠️ ciclo por dado corrompido não trava (limite e visitadas)', async () => {
    const sucessoras = jest.fn(
      async (ids: string[]) =>
        new Map(
          ids.map((i) => [i, doc(i === 'x' ? 'y' : 'x', { congelada: true })]),
        ),
    );
    const r = await atualizacoesDaProva(
      [{ numero: 1, questaoId: 'x' }],
      { questoes: async () => [doc('x', { congelada: true })], sucessoras },
      50,
    );
    expect(sucessoras.mock.calls.length).toBeLessThanOrEqual(50);
    expect(r[0].oferta._id).toBe('y');
  });
});
