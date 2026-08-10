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

function makeFullFactory() {
  const session = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const questaoRepository = {
    getByIdToUpdate: jest.fn(),
    startSession: jest.fn().mockResolvedValue(session),
    canInsertQuestion: jest.fn(),
  };
  const provaRepository = {
    getProvaWithQuestion: jest.fn(),
    getById: jest.fn(),
    addQuestion: jest.fn(),
  };
  const frenteIngles = { _id: 'f-ingles' };
  const frenteEspanhol = { _id: 'f-espanhol' };
  const frenteRepository = {
    getByFilter: jest.fn().mockImplementation(({ nome }: { nome: string }) => {
      if (nome === 'Inglês') return Promise.resolve(frenteIngles);
      if (nome === 'Espanhol') return Promise.resolve(frenteEspanhol);
      return Promise.resolve(null);
    }),
  };
  const simuladoService = {
    addQuestionSimulados: jest.fn(),
  };
  const enemService = {
    validate: jest.fn(),
  };
  const factory = new Enem2010_2017Factory(
    {} as any, // categoriaRepository
    questaoRepository as any,
    provaRepository as any,
    frenteRepository as any,
    simuladoService as any,
    {} as any, // simuladoRepository
    enemService as any,
  );
  return {
    factory,
    questaoRepository,
    provaRepository,
    simuladoService,
    enemService,
    session,
  };
}

describe('Enem2010_2017Factory.getMissingNumbers (Regra B — Dia 2, idiomáticas 91-95)', () => {
  it('marca como faltante a idiomática (91-95) que só tem 1 ocorrência', async () => {
    const questoes: any[] = [];
    for (let n = 91; n <= 180; n++) questoes.push({ numero: n, questao: {} });
    questoes.push({ numero: 91, questao: {} }); // 91 agora com 2

    const { factory } = makeFactory();
    const missing = await factory.getMissingNumbers({
      nome: 'Enem Dia 2 2015 PRIMEIRA 1',
      inicialNumero: 91,
      questoes,
    } as any);

    expect(missing).toEqual([92, 93, 94, 95]);
  });
});

describe('Enem2010_2017Factory.verifyNumberProva (Regra C — idiomáticas 91-95)', () => {
  it('numero livre → true', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({ questoes: [] }),
    );
    expect(await factory.verifyNumberProva('p1', 120)).toBe(true);
  });

  it('idiomático (91-95) com 1 ocorrência → true', async () => {
    const { factory } = makeFactory(
      jest
        .fn()
        .mockResolvedValue({ questoes: [{ numero: 92, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 92)).toBe(true);
  });

  it('idiomático (91-95) com 2 ocorrências → false', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({
        questoes: [
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
        .mockResolvedValue({ questoes: [{ numero: 100, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 100)).toBe(false);
  });
});

describe('Enem2010_2017Factory.addQuestaoExistenteAProva', () => {
  it('valida ENEM (91-95) e adiciona nos simulados selecionados, em transação', async () => {
    const { factory, questaoRepository, provaRepository, session } =
      makeFullFactory();

    const questao = {
      _id: 'q1',
      status: 'Approved',
      enemArea: 'Ciências Humanas',
      frente1: { _id: 'f-hist' },
    } as any;
    const prova = { _id: 'p1', simulados: [] } as any;

    questaoRepository.getByIdToUpdate.mockResolvedValue(questao);
    provaRepository.getById.mockResolvedValue(prova);

    await factory.addQuestaoExistenteAProva('q1', 'p1', 50);

    expect(provaRepository.addQuestion).toHaveBeenCalledWith(
      'p1',
      questao,
      50,
      expect.anything(),
    );
    expect(session.commitTransaction).toHaveBeenCalled();
  });
});
