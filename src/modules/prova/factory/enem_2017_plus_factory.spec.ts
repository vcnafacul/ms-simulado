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
    const questoes: any[] = [];
    for (let n = 1; n <= 90; n++) questoes.push({ numero: n, questao: {} });
    questoes.push({ numero: 1, questao: {} }); // numero 1 agora tem 2

    const { factory } = makeFactory();
    const missing = await factory.getMissingNumbers({
      nome: 'Enem Dia 1 2020 PRIMEIRA 1',
      inicialNumero: 1,
      questoes,
    } as any);

    expect(missing).toEqual([2, 3, 4, 5]);
  });

  it('marca numero totalmente ausente como faltante', async () => {
    const questoes: any[] = [];
    for (let n = 1; n <= 90; n++) {
      if (n === 50) continue;
      questoes.push({ numero: n, questao: {} });
      if (n < 6) questoes.push({ numero: n, questao: {} }); // 1-5 completas
    }
    const { factory } = makeFactory();
    const missing = await factory.getMissingNumbers({
      nome: 'Enem Dia 1 2020 PRIMEIRA 1',
      inicialNumero: 1,
      questoes,
    } as any);
    expect(missing).toEqual([50]);
  });
});

describe('Enem2017PlusFactory.verifyNumberProva (Regra C)', () => {
  it('numero livre → true', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({ questoes: [] }),
    );
    expect(await factory.verifyNumberProva('p1', 50)).toBe(true);
  });

  it('idiomático (1-5) com 1 ocorrência → true (cabe o 2º)', async () => {
    const { factory } = makeFactory(
      jest
        .fn()
        .mockResolvedValue({ questoes: [{ numero: 3, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 3)).toBe(true);
  });

  it('idiomático (1-5) com 2 ocorrências → false', async () => {
    const { factory } = makeFactory(
      jest.fn().mockResolvedValue({
        questoes: [
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
        .mockResolvedValue({ questoes: [{ numero: 10, questao: {} }] }),
    );
    expect(await factory.verifyNumberProva('p1', 10)).toBe(false);
  });
});

describe('Enem2017PlusFactory.updateQuestion — numero-sync (mudança pura de número)', () => {
  function makeSession() {
    return {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn(),
    };
  }

  it('reconcilia o numero no subdoc da prova e do simulado quando só o número muda', async () => {
    const simulado: any = {
      _id: 's1',
      questoes: [{ questao: { _id: 'qX' }, numero: 10 }],
    };
    const prova: any = {
      _id: 'p1',
      simulados: [simulado],
      questoes: [{ questao: { _id: 'qX' }, numero: 10 }],
    };

    const session = makeSession();
    const questaoRepository: any = {
      startSession: jest.fn().mockResolvedValue(session),
      getByIdToUpdate: jest.fn().mockResolvedValue({
        _id: 'qX',
        numero: 10,
        enemArea: 'X',
        prova: { _id: { toString: () => 'p1' } },
        frente1: { _id: { toString: () => 'f0' } },
      }),
      updateQuestion: jest.fn().mockResolvedValue(undefined),
    };
    const provaRepository: any = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const frenteRepository: any = {
      getByFilter: jest.fn().mockResolvedValue({ _id: { toString: () => 'fi' } }),
    };
    const simuladoService: any = {
      addQuestionSimulados: jest.fn().mockResolvedValue(undefined),
      removeQuestionSimulados: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository: any = {
      update: jest.fn().mockResolvedValue(undefined),
      removeDuplicatedSimulados: jest.fn().mockReturnValue([]),
    };
    const enemService: any = {
      validate: jest.fn().mockResolvedValue(undefined),
    };

    const factory = new Enem2017PlusFactory(
      {} as any, // categoriaRepository
      questaoRepository,
      provaRepository,
      frenteRepository,
      simuladoService,
      simuladoRepository,
      enemService,
    );

    await factory.updateQuestion({
      _id: 'qX',
      numero: 11,
      prova: 'p1',
      enemArea: 'X',
      frente1: 'f0',
    } as any);

    // nenhuma operação estrutural (mesma prova/área)
    expect(simuladoService.addQuestionSimulados).not.toHaveBeenCalled();
    expect(simuladoService.removeQuestionSimulados).not.toHaveBeenCalled();
    // numero-sync reconciliou prova + simulado
    expect(prova.questoes[0].numero).toBe(11);
    expect(provaRepository.update).toHaveBeenCalledWith(prova);
    expect(simulado.questoes[0].numero).toBe(11);
    expect(simuladoRepository.update).toHaveBeenCalledWith(simulado);
  });
});
