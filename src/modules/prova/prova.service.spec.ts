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
  );
  return { service, repository, simuladoRepository };
}

describe('ProvaService.approvedQuestion — regra bloqueado com qtd null', () => {
  it('desbloqueia simulado de categoria livre (null) quando todas aprovadas', async () => {
    const simulado: any = {
      _id: 's1',
      questoes: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      categoria: { quantidadeTotalQuestao: null },
      bloqueado: true,
    };
    const prova = {
      questoes: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
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
      questoes: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      categoria: { quantidadeTotalQuestao: 30 },
      bloqueado: true,
    };
    const prova = {
      questoes: [{ questao: { _id: 'q1', status: Status.Pending }, numero: 1 }],
      simulados: [simulado],
    };
    const { service } = makeService({
      getById: jest.fn().mockResolvedValue(prova),
    });

    await service.approvedQuestion('p1', 'q1');

    expect(simulado.bloqueado).toBe(true);
  });

  it('mantém bloqueado quando alguma questão do simulado não tem número', async () => {
    const simulado: any = {
      _id: 's1',
      questoes: [
        { questao: { _id: 'q1', status: Status.Pending }, numero: null },
      ],
      categoria: { quantidadeTotalQuestao: null },
      bloqueado: true,
    };
    const prova = {
      questoes: [
        { questao: { _id: 'q1', status: Status.Pending }, numero: null },
      ],
      simulados: [simulado],
    } as any;
    const { service } = makeService({
      getById: jest.fn().mockResolvedValue(prova),
    });

    await service.approvedQuestion('p1', 'q1');

    expect(simulado.bloqueado).toBe(true);
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
      questoes: [] as any[],
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

describe('ProvaService.syncNumero', () => {
  it('delega para o helper usando repository e simuladoRepository do service', async () => {
    const sml = { questoes: [{ questao: { _id: 'q1' }, numero: 5 }] };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: 5 }],
      simulados: [sml],
    };
    const repository: any = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository: any = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ProvaService(
      {} as any,
      repository,
      {} as any,
      simuladoRepository,
      {} as any,
    );

    await service.syncNumero('p1', 'q1', 9);

    expect(prova.questoes[0].numero).toBe(9);
    expect(sml.questoes[0].numero).toBe(9);
    expect(repository.update).toHaveBeenCalledWith(prova, undefined);
    expect(simuladoRepository.update).toHaveBeenCalledWith(sml, undefined);
  });
});

describe('ProvaService.refuseQuestion — recompute questoes', () => {
  it('exclui a questão recusada da contagem e bloqueia o simulado', async () => {
    const simulado: any = {
      _id: 's1',
      questoes: [
        { questao: { _id: 'q1', status: Status.Approved }, numero: 1 },
        { questao: { _id: 'q2', status: Status.Approved }, numero: 2 },
      ],
      categoria: { quantidadeTotalQuestao: 2 },
      bloqueado: false,
    };
    const prova = {
      questoes: [
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
