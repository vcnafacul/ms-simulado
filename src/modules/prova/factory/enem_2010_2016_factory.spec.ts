import { Enem2010_2017Factory } from './enem_2010_2016_factory';

function makeFactory(getProvaWithQuestion?: jest.Mock) {
  const provaRepository = {
    getProvaWithQuestion: getProvaWithQuestion ?? jest.fn(),
  };
  const factory = new Enem2010_2017Factory(
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

describe('Enem2010_2017Factory.getMissingNumbers (Regra B — Dia 2, idiomáticas 91-95)', () => {
  it('marca como faltante a idiomática (91-95) que só tem 1 ocorrência', async () => {
    const questoesNovo: any[] = [];
    for (let n = 91; n <= 180; n++) questoesNovo.push({ numero: n, questao: {} });
    questoesNovo.push({ numero: 91, questao: {} }); // 91 agora com 2

    const { factory } = makeFactory();
    const missing = await factory.getMissingNumbers({
      nome: 'Enem Dia 2 2015 PRIMEIRA 1',
      inicialNumero: 91,
      questoesNovo,
    } as any);

    expect(missing).toEqual([92, 93, 94, 95]);
  });
});

describe('Enem2010_2017Factory.verifyNumberProva (Regra C — idiomáticas 91-95)', () => {
  it('numero livre → true', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({ questoesNovo: [] }),
    );
    expect(await factory.verifyNumberProva('p1', 120)).toBe(true);
  });

  it('idiomático (91-95) com 1 ocorrência → true', async () => {
    const { factory } = makeFactory(
      jest
        .fn()
        .mockResolvedValue({ questoesNovo: [{ numero: 92, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 92)).toBe(true);
  });

  it('idiomático (91-95) com 2 ocorrências → false', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({
        questoesNovo: [
          { numero: 92, questao: {} },
          { numero: 92, questao: {} },
        ],
      }),
    );
    expect(await factory.verifyNumberProva('p1', 92)).toBe(false);
  });

  it('não-idiomático ocupado → false', async () => {
    const { factory } = makeFactory(
      jest
        .fn()
        .mockResolvedValue({ questoesNovo: [{ numero: 100, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 100)).toBe(false);
  });
});
