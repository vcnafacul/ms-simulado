import { BadRequestException, HttpException } from '@nestjs/common';
import { CustomProvaFactory } from './custom_prova_factory';
import { Categoria } from 'src/modules/categoria/schemas/categoria.schema';

function makeSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
  };
}

function makeFactory(overrides?: {
  categoria?: Partial<Categoria>;
  getByFilter?: jest.Mock;
  getById?: jest.Mock;
  getProvaWithQuestion?: jest.Mock;
  getByIdToUpdate?: jest.Mock;
  findProvaAtual?: jest.Mock;
  session?: ReturnType<typeof makeSession>;
}) {
  const session = overrides?.session ?? makeSession();
  const questaoRepository = {
    startSession: jest.fn().mockResolvedValue(session),
    create: jest.fn().mockImplementation(async (q) => ({ ...q, _id: 'q-new' })),
    getByIdToUpdate: overrides?.getByIdToUpdate ?? jest.fn(),
    findProvaAtual:
      overrides?.findProvaAtual ?? jest.fn().mockResolvedValue(undefined),
    updateQuestion: jest.fn().mockResolvedValue(undefined),
  };
  const provaRepository = {
    getByFilter: overrides?.getByFilter ?? jest.fn().mockResolvedValue(null),
    getById: overrides?.getById ?? jest.fn(),
    getProvaWithQuestion: overrides?.getProvaWithQuestion ?? jest.fn(),
    addQuestion: jest.fn().mockResolvedValue(undefined),
    removeQuestion: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const simuladoService = {
    addQuestionSimulados: jest.fn().mockResolvedValue(undefined),
    removeQuestionSimulados: jest.fn().mockResolvedValue(undefined),
  };
  const simuladoRepository = {
    create: jest.fn().mockImplementation(async (s) => ({ ...s, _id: 's-new' })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const categoria = {
    nome: 'Personalizado 30q 60min',
    quantidadeTotalQuestao: 30,
    exame: { _id: 'e1', nome: 'Personalizado' },
    ...overrides?.categoria,
  } as unknown as Categoria;

  const factory = new CustomProvaFactory(
    questaoRepository as any,
    provaRepository as any,
    simuladoService as any,
    simuladoRepository as any,
    categoria,
  );
  return {
    factory,
    questaoRepository,
    provaRepository,
    simuladoService,
    simuladoRepository,
    categoria,
    session,
  };
}

describe('CustomProvaFactory.createProva', () => {
  it('lança 400 quando o nome está vazio', async () => {
    const { factory } = makeFactory();
    await expect(
      factory.createProva({ criadorId: 'u1', nome: '  ' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança 409 quando já existe prova com mesmo nome e criador', async () => {
    const { factory, provaRepository } = makeFactory({
      getByFilter: jest.fn().mockResolvedValue({ _id: 'existe' }),
    });
    await expect(
      factory.createProva({ criadorId: 'u1', nome: 'Minha Prova' } as any),
    ).rejects.toBeInstanceOf(HttpException);
    expect(provaRepository.getByFilter).toHaveBeenCalledWith({
      nome: 'Minha Prova',
      criadorId: 'u1',
    });
  });

  it('cria prova com nome, criadorId, totalQuestao da categoria e enemAreas vazio', async () => {
    const { factory } = makeFactory();
    const prova = await factory.createProva({
      criadorId: 'u1',
      nome: 'Minha Prova',
      ano: 2024,
    } as any);
    expect(prova.nome).toBe('Minha Prova');
    expect(prova.criadorId).toBe('u1');
    expect(prova.cursinhoId).toBeNull();
    expect(prova.totalQuestao).toBe(30);
    expect(prova.enemAreas).toEqual([]);
  });

  it('propaga totalQuestao null quando categoria é "livre"', async () => {
    const { factory } = makeFactory({
      categoria: { quantidadeTotalQuestao: null } as any,
    });
    const prova = await factory.createProva({
      criadorId: 'u1',
      nome: 'Livre',
    } as any);
    expect(prova.totalQuestao).toBeNull();
  });
});

describe('CustomProvaFactory.createSimulados', () => {
  it('lança 400 quando nomeSimulado não foi informado', async () => {
    const { factory } = makeFactory();
    await factory.createProva({
      criadorId: 'u1',
      nome: 'Minha Prova',
    } as any);
    const prova = { simulados: [], categoria: { exame: { nome: 'X' } } } as any;
    await expect(factory.createSimulados(prova)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cria exatamente 1 simulado com a categoria da prova e criador/cursinho propagados', async () => {
    const { factory, simuladoRepository } = makeFactory();
    await factory.createProva({
      criadorId: 'u1',
      nome: 'Minha Prova',
      nomeSimulado: 'Simulado 1',
    } as any);
    const prova = {
      simulados: [],
      criadorId: 'u1',
      cursinhoId: null,
      categoria: { exame: { nome: 'Personalizado' } },
    } as any;

    await factory.createSimulados(prova);

    expect(simuladoRepository.create).toHaveBeenCalledTimes(1);
    const arg = simuladoRepository.create.mock.calls[0][0];
    expect(arg.nome).toBe('Simulado 1');
    expect(arg.categoria).toBe(prova.categoria);
    expect(arg.criadorId).toBe('u1');
    expect(arg.cursinhoId).toBeNull();
    expect(prova.simulados).toHaveLength(1);
  });
});

describe('CustomProvaFactory.createQuestion', () => {
  it('cria a questão em transação e adiciona ao único simulado', async () => {
    const provaToEnter = { _id: 'p1', simulados: [{ _id: 's1' }] };
    const { factory, simuladoService, provaRepository, session } = makeFactory({
      getById: jest.fn().mockResolvedValue(provaToEnter),
    });

    const result = await factory.createQuestion({
      prova: 'p1',
      numero: 1,
    } as any);

    expect(result._id).toBe('q-new');
    expect(simuladoService.addQuestionSimulados).toHaveBeenCalledWith(
      provaToEnter.simulados,
      result,
      1,
      session,
    );
    expect(provaRepository.addQuestion).toHaveBeenCalledWith('p1', result, 1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('faz rollback quando algo falha na transação', async () => {
    const provaToEnter = { _id: 'p1', simulados: [{ _id: 's1' }] };
    const { factory, provaRepository, session } = makeFactory({
      getById: jest.fn().mockResolvedValue(provaToEnter),
    });
    provaRepository.addQuestion.mockRejectedValueOnce(new Error('boom'));

    await expect(
      factory.createQuestion({ prova: 'p1' } as any),
    ).rejects.toThrow('boom');
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

describe('CustomProvaFactory.updateQuestion', () => {
  it('mesma prova: apenas atualiza a questão (sem mexer em simulados)', async () => {
    const questaoAtual = { _id: 'q1', prova: { _id: 'p1' } };
    const { factory, questaoRepository, simuladoService, provaRepository } =
      makeFactory({
        getByIdToUpdate: jest.fn().mockResolvedValue(questaoAtual),
        getById: jest.fn().mockResolvedValue({ _id: 'p1', simulados: [] }),
        findProvaAtual: jest.fn().mockResolvedValue('p1'),
      });

    await factory.updateQuestion({ _id: 'q1', prova: 'p1' } as any);

    expect(questaoRepository.updateQuestion).toHaveBeenCalledTimes(1);
    expect(simuladoService.removeQuestionSimulados).not.toHaveBeenCalled();
    expect(simuladoService.addQuestionSimulados).not.toHaveBeenCalled();
    expect(provaRepository.removeQuestion).not.toHaveBeenCalled();
  });

  it('mudança de prova: remove da antiga e adiciona na nova', async () => {
    const questaoAtual = { _id: 'q1', prova: { _id: 'p-old' } };
    const oldProva = { _id: 'p-old', simulados: [{ _id: 's-old' }] };
    const newProva = { _id: 'p-new', simulados: [{ _id: 's-new' }] };
    const getById = jest
      .fn()
      .mockImplementation(async (id: string) =>
        id === 'p-new' ? newProva : oldProva,
      );
    const { factory, simuladoService, provaRepository } = makeFactory({
      getByIdToUpdate: jest.fn().mockResolvedValue(questaoAtual),
      getById,
      findProvaAtual: jest.fn().mockResolvedValue('p-old'),
    });

    await factory.updateQuestion({ _id: 'q1', prova: 'p-new' } as any);

    expect(simuladoService.removeQuestionSimulados).toHaveBeenCalledWith(
      oldProva.simulados,
      questaoAtual,
      expect.anything(),
    );
    expect(provaRepository.removeQuestion).toHaveBeenCalledWith(
      'p-old',
      questaoAtual,
    );
    expect(simuladoService.addQuestionSimulados).toHaveBeenCalledWith(
      newProva.simulados,
      questaoAtual,
      undefined,
      expect.anything(),
    );
    expect(provaRepository.addQuestion).toHaveBeenCalledWith(
      'p-new',
      questaoAtual,
      undefined,
    );
  });
});

describe('CustomProvaFactory.verifyNumberProva', () => {
  it('retorna false quando o número já existe', async () => {
    const { factory } = makeFactory({
      getProvaWithQuestion: jest
        .fn()
        .mockResolvedValue({ questoes: [{ numero: 5 }] }),
    });
    expect(await factory.verifyNumberProva('p1', 5)).toBe(false);
  });

  it('retorna true quando o número ainda não existe', async () => {
    const { factory } = makeFactory({
      getProvaWithQuestion: jest
        .fn()
        .mockResolvedValue({ questoes: [{ numero: 5 }] }),
    });
    expect(await factory.verifyNumberProva('p1', 7)).toBe(true);
  });
});

describe('CustomProvaFactory.getMissingNumbers', () => {
  it('retorna [] quando quantidadeTotalQuestao é null', async () => {
    const { factory } = makeFactory();
    const prova = {
      categoria: { quantidadeTotalQuestao: null },
      questoes: [],
    } as any;
    expect(await factory.getMissingNumbers(prova)).toEqual([]);
  });

  it('retorna a faixa que falta quando a quantidade é numérica', async () => {
    const { factory } = makeFactory();
    const prova = {
      categoria: { quantidadeTotalQuestao: 4 },
      questoes: [{ numero: 2 }, { numero: 4 }],
    } as any;
    expect(await factory.getMissingNumbers(prova)).toEqual([1, 3]);
  });
});

describe('CustomProvaFactory.addQuestaoExistenteAProva', () => {
  it('adiciona questão existente à prova custom em transação (todos os simulados)', async () => {
    const questao = { _id: 'q1', status: 'Approved', enemArea: '', frente1: null } as any;
    const prova = { _id: 'p1', simulados: [{ _id: 's1' }] } as any;
    const { factory, questaoRepository, provaRepository, simuladoService, session } = makeFactory({
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      getById: jest.fn().mockResolvedValue(prova),
    });

    await factory.addQuestaoExistenteAProva('q1', 'p1', 7);

    expect(simuladoService.addQuestionSimulados).toHaveBeenCalledWith(
      prova.simulados,
      questao,
      7,
      expect.anything(),
    );
    expect(provaRepository.addQuestion).toHaveBeenCalledWith(
      'p1',
      questao,
      7,
      expect.anything(),
    );
    expect(session.commitTransaction).toHaveBeenCalledTimes(1);
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

describe('CustomProvaFactory.updateQuestion — numero-sync', () => {
  it('reconcilia o numero no subdoc da prova e do simulado quando o número muda', async () => {
    const simulado: any = {
      _id: 's1',
      questoes: [{ questao: { _id: 'qX' }, numero: 5 }],
    };
    const prova: any = {
      _id: 'p1',
      simulados: [simulado],
      questoes: [{ questao: { _id: 'qX' }, numero: 5 }],
    };
    const getById = jest.fn().mockResolvedValue(prova);
    const getByIdToUpdate = jest.fn().mockResolvedValue({
      _id: 'qX',
      numero: 5,
      prova: { _id: 'p1' },
    });
    const { factory, provaRepository, simuladoRepository } = makeFactory({
      getById,
      getByIdToUpdate,
      findProvaAtual: jest.fn().mockResolvedValue('p1'),
    });

    await factory.updateQuestion({
      _id: 'qX',
      numero: 6,
      prova: 'p1',
    } as any);

    expect(prova.questoes[0].numero).toBe(6);
    expect(provaRepository.update).toHaveBeenCalledWith(prova, expect.anything());
    expect(simulado.questoes[0].numero).toBe(6);
    expect(simuladoRepository.update).toHaveBeenCalledWith(
      simulado,
      expect.anything(),
    );
  });

  it('NÃO reconcilia quando o input não traz numero', async () => {
    const prova: any = {
      _id: 'p1',
      simulados: [],
      questoes: [{ questao: { _id: 'qX' }, numero: 5 }],
    };
    const getById = jest.fn().mockResolvedValue(prova);
    const getByIdToUpdate = jest.fn().mockResolvedValue({
      _id: 'qX',
      prova: { _id: 'p1' },
    });
    const { factory, provaRepository } = makeFactory({
      getById,
      getByIdToUpdate,
      findProvaAtual: jest.fn().mockResolvedValue('p1'),
    });

    await factory.updateQuestion({
      _id: 'qX',
      prova: 'p1',
    } as any);

    expect(provaRepository.update).not.toHaveBeenCalled();
  });
});
