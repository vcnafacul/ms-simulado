import { ProvaService } from './prova.service';
import { Status } from '../questao/enums/status.enum';

function makeService(overrides?: { getById?: jest.Mock }) {
  const repository = {
    getById: overrides?.getById ?? jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const simuladoRepository = { update: jest.fn().mockResolvedValue(undefined) };
  const service = new ProvaService(
    {} as any, // provaFactory
    repository as any,
    {} as any, // categoriaRepository
    simuladoRepository as any,
    {} as any, // questaoRepository
    {} as any, // frenteRepository
  );
  return { service, repository, simuladoRepository };
}

describe('ProvaService.approvedQuestion — regra bloqueado com qtd null', () => {
  it('desbloqueia simulado de categoria livre (null) quando todas aprovadas', async () => {
    const simulado: any = {
      _id: 's1',
      questoesNovo: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      categoria: { quantidadeTotalQuestao: null },
      bloqueado: true,
    };
    const prova = {
      questoesNovo: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      simulados: [simulado],
    } as any;
    const { service } = makeService({
      getById: jest.fn().mockResolvedValue(prova),
    });

    await service.approvedQuestion('p1', 'q1');

    expect(simulado.bloqueado).toBe(false);
    expect(prova.totalQuestaoValidadas).toBe(1);
  });

  it('mantém bloqueado quando categoria numérica ainda não atingiu a quantidade', async () => {
    const simulado: any = {
      _id: 's1',
      questoesNovo: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      categoria: { quantidadeTotalQuestao: 30 },
      bloqueado: true,
    };
    const prova = {
      questoesNovo: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      simulados: [simulado],
    };
    const { service } = makeService({
      getById: jest.fn().mockResolvedValue(prova),
    });

    await service.approvedQuestion('p1', 'q1');

    expect(simulado.bloqueado).toBe(true);
  });
});

describe('ProvaService.selectQuestionsForSimulado — branch custom', () => {
  it('prova custom: retorna TODAS as questões da prova (sem string matching)', () => {
    const { service } = makeService();
    const questoes = [
      { _id: 'q1', numero: 1 },
      { _id: 'q2', numero: 2 },
    ];
    const simulado: any = { nome: 'Nome livre qualquer' } as any;
    const prova = { categoria: { custom: true }, ano: 2024 } as any;

    const result = (service as any).selectQuestionsForSimulado(
      simulado,
      questoes,
      prova,
      undefined,
      undefined,
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual(questoes);
  });

  it('prova oficial: simulado padrão recebe todas as questões (string matching preservado)', () => {
    const { service } = makeService();
    const questoes = [
      { _id: 'q1', numero: 1, enemArea: 'Matemática' },
      { _id: 'q2', numero: 2, enemArea: 'Matemática' },
    ];
    const prova = {
      categoria: { custom: false, nome: 'Enem Dia 2' },
      ano: 2023,
    } as any;
    const simulado: any = { nome: 'Enem Dia 2 2023' } as any; // === `${nome} ${ano}`

    const result = (service as any).selectQuestionsForSimulado(
      simulado,
      questoes,
      prova,
      { _id: 'fi' },
      { _id: 'fe' },
    );

    expect(result).toHaveLength(2);
  });
});

describe('ProvaService.getAllByCursinho', () => {
  function makeProva(id: string) {
    return {
      _id: id,
      edicao: 'Regular',
      aplicacao: 1,
      ano: 2024,
      categoria: { nome: 'Personalizado', exame: { nome: 'Personalizado' } },
      nome: `Prova ${id}`,
      totalQuestao: 30,
      gabarito: 'x',
      totalQuestaoValidadas: 0,
      filename: 'f.pdf',
      enemAreas: [] as any[],
      questoesNovo: [] as any[],
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
  }

  function makeServiceWithGetAll(getAll: jest.Mock) {
    const repository = { getAll };
    const service = new ProvaService(
      {} as any, // provaFactory
      repository as any,
      {} as any, // categoriaRepository
      {} as any, // simuladoRepository
      {} as any, // questaoRepository
      {} as any, // frenteRepository
    );
    return { service, repository };
  }

  it('filtra por cursinhoId via where e mantém a paginação', async () => {
    const getAll = jest.fn().mockResolvedValue({
      data: [makeProva('p1')],
      page: 1,
      limit: 40,
      totalItems: 1,
    });
    const { service } = makeServiceWithGetAll(getAll);

    const result = await service.getAllByCursinho('curs-1', {
      page: 1,
      limit: 40,
    });

    expect(getAll).toHaveBeenCalledWith({
      page: 1,
      limit: 40,
      where: { cursinhoId: 'curs-1' },
    });
    expect(result.totalItems).toBe(1);
    expect(result.data[0]._id).toBe('p1');
    expect(result.data[0].categoria).toBe('Personalizado');
    expect(result.data[0].exame).toBe('Personalizado');
    expect(result.data[0].totalQuestaoCadastradas).toBe(0);
  });

  it('cursinho sem provas retorna data vazia (não lança)', async () => {
    const getAll = jest.fn().mockResolvedValue({
      data: [],
      page: 1,
      limit: 40,
      totalItems: 0,
    });
    const { service } = makeServiceWithGetAll(getAll);

    const result = await service.getAllByCursinho('curs-x', {
      page: 1,
      limit: 40,
    });

    expect(result.data).toEqual([]);
    expect(result.totalItems).toBe(0);
  });
});

describe('ProvaService.refuseQuestion — recompute questoesNovo', () => {
  it('exclui a questão recusada da contagem e bloqueia o simulado', async () => {
    const simulado: any = {
      _id: 's1',
      questoesNovo: [
        { questao: { _id: 'q1', status: Status.Approved }, numero: 1 },
        { questao: { _id: 'q2', status: Status.Approved }, numero: 2 },
      ],
      categoria: { quantidadeTotalQuestao: 2 },
      bloqueado: false,
    };
    const prova = {
      questoesNovo: [
        { questao: { _id: 'q1', status: Status.Approved }, numero: 1 },
        { questao: { _id: 'q2', status: Status.Approved }, numero: 2 },
      ],
      simulados: [simulado],
    } as any;
    const { service, simuladoRepository, repository } = makeService({
      getById: jest.fn().mockResolvedValue(prova),
    });

    await service.refuseQuestion('p1', 'q1');

    // q1 recusada não conta; sobra q2 aprovada
    expect(prova.totalQuestaoValidadas).toBe(1);
    // simulado tinha q1 → recalcula bloqueado (q1 excluída => nem todas aprovadas)
    expect(simulado.bloqueado).toBe(true);
    expect(simuladoRepository.update).toHaveBeenCalledWith(simulado);
    expect(repository.update).toHaveBeenCalledWith(prova);
  });
});

describe('ProvaService.executeSync (single-write questoesNovo)', () => {
  it('grava questoesNovo na prova e no simulado (custom) e não escreve questoes', async () => {
    const questao: any = {
      _id: 'qA',
      numero: 1,
      status: Status.Approved,
      prova: 'p1',
      frente1: { _id: 'f1' },
      enemArea: 'Matemática',
    };
    const simulado: any = {
      _id: 's1',
      nome: 'Sim custom',
      categoria: { quantidadeTotalQuestao: 1 },
      questoes: [],
      questoesNovo: [],
      bloqueado: true,
    };
    const prova: any = {
      _id: 'p1',
      nome: 'Prova custom',
      ano: 2020,
      categoria: { custom: true, quantidadeTotalQuestao: 1, exame: {} },
      simulados: [simulado],
      questoes: [],
      questoesNovo: [],
    };

    const repository: any = {
      getAllPopulated: jest.fn().mockResolvedValue([prova]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository: any = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const questaoRepository: any = {
      getAllByProvaIds: jest.fn().mockResolvedValue([questao]),
    };
    const frenteRepository: any = {
      getByFilter: jest.fn().mockResolvedValue({ _id: 'fx' }),
    };

    const service = new ProvaService(
      {} as any, // provaFactory
      repository,
      {} as any, // categoriaRepository
      simuladoRepository,
      questaoRepository,
      frenteRepository,
    );

    await (service as any).executeSync();

    expect(repository.update).toHaveBeenCalledWith(prova);
    expect(prova.questoesNovo).toEqual([{ questao: 'qA', numero: 1 }]);
    expect(prova.questoes).toEqual([]);
    expect(simuladoRepository.update).toHaveBeenCalledWith(simulado);
    expect(simulado.questoesNovo).toEqual([{ questao: 'qA', numero: 1 }]);
    expect(simulado.questoes).toEqual([]);
    expect(simulado.bloqueado).toBe(false);
  });
});
