import { Enem2017PlusFactory } from './enem_2017_plus_factory';

function makeFactory(getProvaWithQuestion?: jest.Mock) {
  const provaRepository = {
    getProvaWithQuestion: getProvaWithQuestion ?? jest.fn(),
  };
  const factory = new Enem2017PlusFactory(
    {} as any, // categoriaRepository
    {} as any, // questaoRepository
    provaRepository as any,
    {} as any, // frenteRepository
    {} as any, // simuladoService
    {} as any, // simuladoRepository
    {} as any, // enemService
  );
  return { factory, provaRepository };
}

describe('Enem2017PlusFactory.getMissingNumbers (Regra A — Dia 1, idiomáticas 1-5)', () => {
  it('marca como faltante a idiomática (1-5) que só tem 1 ocorrência', async () => {
    const questoesNovo: any[] = [];
    for (let n = 1; n <= 90; n++) questoesNovo.push({ numero: n, questao: {} });
    questoesNovo.push({ numero: 1, questao: {} }); // numero 1 agora tem 2

    const { factory } = makeFactory();
    const missing = await factory.getMissingNumbers({
      nome: 'Enem Dia 1 2020 PRIMEIRA 1',
      inicialNumero: 1,
      questoesNovo,
    } as any);

    expect(missing).toEqual([2, 3, 4, 5]);
  });

  it('marca numero totalmente ausente como faltante', async () => {
    const questoesNovo: any[] = [];
    for (let n = 1; n <= 90; n++) {
      if (n === 50) continue;
      questoesNovo.push({ numero: n, questao: {} });
      if (n < 6) questoesNovo.push({ numero: n, questao: {} }); // 1-5 completas
    }
    const { factory } = makeFactory();
    const missing = await factory.getMissingNumbers({
      nome: 'Enem Dia 1 2020 PRIMEIRA 1',
      inicialNumero: 1,
      questoesNovo,
    } as any);
    expect(missing).toEqual([50]);
  });
});

describe('Enem2017PlusFactory.verifyNumberProva (Regra C)', () => {
  it('numero livre → true', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({ questoesNovo: [] }),
    );
    expect(await factory.verifyNumberProva('p1', 50)).toBe(true);
  });

  it('idiomático (1-5) com 1 ocorrência → true (cabe o 2º)', async () => {
    const { factory } = makeFactory(
      jest
        .fn()
        .mockResolvedValue({ questoesNovo: [{ numero: 3, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 3)).toBe(true);
  });

  it('idiomático (1-5) com 2 ocorrências → false', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({
        questoesNovo: [
          { numero: 3, questao: {} },
          { numero: 3, questao: {} },
        ],
      }),
    );
    expect(await factory.verifyNumberProva('p1', 3)).toBe(false);
  });

  it('não-idiomático ocupado → false', async () => {
    const { factory } = makeFactory(
      jest
        .fn()
        .mockResolvedValue({ questoesNovo: [{ numero: 10, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 10)).toBe(false);
  });
});
