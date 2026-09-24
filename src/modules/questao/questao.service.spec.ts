import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { Alternativa } from './enums/alternativa.enum';
import { EnemArea } from './enums/enem-area.enum';
import { QuestaoService } from './questao.service';

const mockFactory = {
  verifyNumberProva: jest.fn(),
  createQuestion: jest.fn(),
};

const mockProvaFactory = {
  getFactory: jest.fn().mockReturnValue(mockFactory),
};

const mockProvaRepository = {
  getById: jest.fn().mockResolvedValue({
    _id: 'prova-id',
    categoria: { exame: {} },
    ano: 2023,
  }),
};

function makeService(): QuestaoService {
  return new QuestaoService(
    null as any,
    null as any,
    mockProvaRepository as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    mockProvaFactory as any,
  );
}

function makeCreateDto(
  numero: number | null | undefined,
): CreateQuestaoDTOInput {
  return {
    prova: 'prova-id',
    enemArea: EnemArea.Linguagens,
    numero: numero as any,
    alternativa: Alternativa.A,
  } as CreateQuestaoDTOInput;
}

describe('QuestaoService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvaRepository.getById.mockResolvedValue({
      _id: 'prova-id',
      categoria: { exame: {} },
      ano: 2023,
    });
    mockProvaFactory.getFactory.mockReturnValue(mockFactory);
    mockFactory.createQuestion.mockResolvedValue({ _id: 'new-question-id' });
  });

  it('skips conflict check and creates question when numero is null', async () => {
    const service = makeService();
    await service.create(makeCreateDto(null));

    expect(mockFactory.verifyNumberProva).not.toHaveBeenCalled();
    expect(mockFactory.createQuestion).toHaveBeenCalledTimes(1);
  });

  it('skips conflict check and creates question when numero is undefined', async () => {
    const service = makeService();
    await service.create(makeCreateDto(undefined));

    expect(mockFactory.verifyNumberProva).not.toHaveBeenCalled();
    expect(mockFactory.createQuestion).toHaveBeenCalledTimes(1);
  });

  it('checks conflict and creates when numero is valid and slot is free', async () => {
    mockFactory.verifyNumberProva.mockResolvedValue(true);
    const service = makeService();
    await service.create(makeCreateDto(42));

    expect(mockFactory.verifyNumberProva).toHaveBeenCalledWith('prova-id', 42);
    expect(mockFactory.createQuestion).toHaveBeenCalledTimes(1);
  });

  it('throws CONFLICT when numero is taken', async () => {
    mockFactory.verifyNumberProva.mockResolvedValue(false);
    const service = makeService();

    await expect(service.create(makeCreateDto(42))).rejects.toThrow(
      new HttpException(
        'Possível questão já cadastrada com número 42.',
        HttpStatus.CONFLICT,
      ),
    );
    expect(mockFactory.createQuestion).not.toHaveBeenCalled();
  });
});

describe('QuestaoService.delete / podeExcluir (card 33)', () => {
  const orfa = {
    status: 0,
    congelada: false,
    respondida: false,
    emProva: false,
    emSimulado: false,
    temFilhas: false,
  };

  const montar = (
    estado: Record<string, unknown> | null = orfa,
    escreveu = true,
  ) => {
    const repository: any = {
      estadoParaExclusao: jest
        .fn()
        .mockResolvedValue(
          estado && { estado, origem: 'q0', tipoOrigem: 'copia' },
        ),
      excluir: jest.fn().mockResolvedValue(escreveu),
    };
    const auditLogService = { create: jest.fn().mockResolvedValue({}) };
    const simuladoService = { removeQuestionSimulados: jest.fn() };
    const provaRepository = { removeQuestion: jest.fn() };
    const service = new QuestaoService(
      repository,
      {} as any,
      provaRepository as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogService as any,
      simuladoService as any,
      {} as any,
    );
    return {
      service,
      repository,
      auditLogService,
      simuladoService,
      provaRepository,
    };
  };

  it('questão órfã: exclui', async () => {
    const { service, repository } = montar();

    await service.delete('q1', 'u-1');

    expect(repository.excluir).toHaveBeenCalledWith('q1');
  });

  it('⚠️ NÃO tira a questão de prova nenhuma — o comportamento antigo morreu', async () => {
    /*
      Antes: questão Pending em prova era removida das provas e simulados e
      apagada. Agora questão em prova recusa, e "tirar da prova" é a ação
      explícita de remover.
    */
    const { service, simuladoService, provaRepository } = montar({
      ...orfa,
      emProva: true,
    });

    await expect(service.delete('q1')).rejects.toThrow();
    expect(simuladoService.removeQuestionSimulados).not.toHaveBeenCalled();
    expect(provaRepository.removeQuestion).not.toHaveBeenCalled();
  });

  it('⚠️ recusa com 409 e a lista de TODOS os motivos', async () => {
    const { service, repository } = montar({
      ...orfa,
      status: 1, // Approved
      respondida: true,
    });

    const erro = await service.delete('q1').catch((e) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse().motivos.map((m: any) => m.codigo)).toEqual([
      'aprovada',
      'respondida',
    ]);
    expect(erro.getResponse().motivos[0].texto).toBeTruthy();
    expect(repository.excluir).not.toHaveBeenCalled();
  });

  it('inexistente ou já excluída: 404', async () => {
    const { service, repository } = montar(null);

    await expect(service.delete('q1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.excluir).not.toHaveBeenCalled();
  });

  it('⚠️ a questão mudou entre a checagem e a escrita: recusa, não finge sucesso', async () => {
    const { service, auditLogService } = montar(orfa, false);

    await expect(service.delete('q1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auditLogService.create).not.toHaveBeenCalled();
  });

  it('⚠️ o log guarda o `origem` que a exclusão removeu', async () => {
    // Depois do `$unset`, é o único lugar que sabe de onde ela veio.
    const { service, auditLogService } = montar();

    await service.delete('q1', 'u-1');

    const log = auditLogService.create.mock.calls[0][0];
    expect(log).toMatchObject({ user: 'u-1', entityId: 'q1' });
    expect(JSON.parse(log.changes)).toEqual({
      acao: 'excluir',
      origem: 'q0',
      tipoOrigem: 'copia',
    });
  });

  it('podeExcluir usa as mesmas condições', async () => {
    const { service } = montar({ ...orfa, temFilhas: true });

    await expect(service.podeExcluir('q1')).resolves.toEqual({
      podeExcluir: false,
      motivos: [expect.objectContaining({ codigo: 'origem-de-outras' })],
    });
  });

  it('podeExcluir de questão órfã', async () => {
    const { service } = montar();

    await expect(service.podeExcluir('q1')).resolves.toEqual({
      podeExcluir: true,
      motivos: [],
    });
  });
});

describe('QuestaoService.updateStatus (reverse-lookup provas)', () => {
  it('aprova a questão em cada prova que a contém', async () => {
    const question: any = { _id: 'q1', status: 0 };
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(question),
      UpdateStatus: jest.fn().mockResolvedValue(undefined),
      findProvasContendo: jest
        .fn()
        .mockResolvedValue([{ _id: 'pr1' }, { _id: 'pr2' }]),
    };
    const provaService: any = {
      approvedQuestion: jest.fn().mockResolvedValue(undefined),
      refuseQuestion: jest.fn(),
    };
    const auditLogService: any = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      provaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogService,
      {} as any,
      {} as any,
    );
    const { Status } = require('./enums/status.enum');
    await service.updateStatus('q1', Status.Approved, 'user1');
    expect(provaService.approvedQuestion).toHaveBeenCalledWith('pr1', 'q1');
    expect(provaService.approvedQuestion).toHaveBeenCalledWith('pr2', 'q1');
  });

  it('lança quando a questão não está em nenhuma prova', async () => {
    const { Status } = require('./enums/status.enum');
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue({ _id: 'q1', status: 0 }),
      findProvasContendo: jest.fn().mockResolvedValue([]),
    };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.updateStatus('q1', Status.Approved, 'user1'),
    ).rejects.toBeTruthy();
  });
});

describe('QuestaoService.getAll (provasContendo)', () => {
  it('monta provasContendo por questão via reverse-lookup', async () => {
    const repository: any = {
      getAll: jest.fn().mockResolvedValue({
        data: [
          {
            _id: 'q1',
            provaBase: 'pr1',
            enemArea: 'Mat',
            materia: { nome: 'M' },
            status: 1,
            updatedAt: 'd',
          },
        ],
        page: 1,
        limit: 10,
        totalItems: 1,
      }),
      findProvasContendoMany: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['q1', [{ provaId: 'pr1', provaNome: 'Prova 1', numero: 5 }]],
          ]),
        ),
    };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const res = await service.getAll({ page: 1, limit: 10 });
    expect(res.data[0].provasContendo).toEqual([
      { provaId: 'pr1', provaNome: 'Prova 1', numero: 5 },
    ]);
    expect(res.data[0].provaBase).toBe('pr1');
    expect((res.data[0] as any).prova).toBeUndefined();
    expect((res.data[0] as any).numero).toBeUndefined();
  });
});

describe('QuestaoService.getById', () => {
  it('anexa provasContendo ao detalhe da questao', async () => {
    const doc: any = {
      _id: 'q1',
      toObject: () => ({ _id: 'q1', enemArea: 'Mat', provaBase: 'p1' }),
    };
    const repository: any = {
      getById: jest.fn().mockResolvedValue(doc),
      findProvasContendoMany: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['q1', [{ provaId: 'p1', provaNome: 'Prova 1', numero: 4 }]],
          ]),
        ),
    };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const res: any = await service.getById('q1');

    expect(repository.findProvasContendoMany).toHaveBeenCalledWith(['q1']);
    expect(res.provasContendo).toEqual([
      { provaId: 'p1', provaNome: 'Prova 1', numero: 4 },
    ]);
    expect(res.provaBase).toBe('p1');
  });
});

describe('QuestaoService.adicionarEmProva', () => {
  const { QuestaoService: QS } = require('./questao.service');

  let repository: any;
  let provaRepository: any;
  let provaFactory: any;
  let auditLogService: any;
  let service: any;

  beforeEach(() => {
    repository = {
      provaContemQuestao: jest.fn(),
    };
    provaRepository = {
      getById: jest.fn(),
    };
    provaFactory = {
      getFactory: jest.fn(),
    };
    auditLogService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    service = new QS(
      repository,
      {} as any,
      provaRepository,
      {} as any,
      {} as any,
      {} as any,
      auditLogService,
      {} as any,
      provaFactory,
    );
  });

  it('bloqueia vínculo duplicado', async () => {
    provaRepository.getById.mockResolvedValue({
      _id: 'p1',
      categoria: {},
      ano: 2020,
    });
    (provaFactory.getFactory as jest.Mock).mockReturnValue({
      verifyNumberProva: jest.fn().mockResolvedValue(true),
      addQuestaoExistenteAProva: jest.fn(),
    });
    repository.provaContemQuestao.mockResolvedValue(true);

    await expect(service.adicionarEmProva('q1', 'p1', 5)).rejects.toThrow();
  });

  it('bloqueia número ocupado', async () => {
    provaRepository.getById.mockResolvedValue({
      _id: 'p1',
      categoria: {},
      ano: 2020,
    });
    (provaFactory.getFactory as jest.Mock).mockReturnValue({
      verifyNumberProva: jest.fn().mockResolvedValue(false),
      addQuestaoExistenteAProva: jest.fn(),
    });
    repository.provaContemQuestao.mockResolvedValue(false);

    await expect(service.adicionarEmProva('q1', 'p1', 5)).rejects.toThrow();
  });

  it('delega à factory e audita no caminho feliz', async () => {
    const addFn = jest.fn().mockResolvedValue(undefined);
    provaRepository.getById.mockResolvedValue({
      _id: 'p1',
      categoria: {},
      ano: 2020,
    });
    (provaFactory.getFactory as jest.Mock).mockReturnValue({
      verifyNumberProva: jest.fn().mockResolvedValue(true),
      addQuestaoExistenteAProva: addFn,
    });
    repository.provaContemQuestao.mockResolvedValue(false);

    await service.adicionarEmProva('q1', 'p1', 5);

    expect(addFn).toHaveBeenCalledWith('q1', 'p1', 5);
    expect(auditLogService.create).toHaveBeenCalled();
  });
});

describe('QuestaoService.removerDeProva', () => {
  const { QuestaoService: QS } = require('./questao.service');

  let repository: any;
  let provaRepository: any;
  let simuladoService: any;
  let auditLogService: any;
  let service: any;

  const sessionMock = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  beforeEach(() => {
    repository = {
      findProvasContendo: jest.fn(),
      getByIdToUpdate: jest.fn(),
      setProvaBase: jest.fn().mockResolvedValue(undefined),
      startSession: jest.fn().mockResolvedValue(sessionMock),
    };
    provaRepository = {
      removeQuestion: jest.fn().mockResolvedValue(undefined),
    };
    simuladoService = {
      removeQuestionSimulados: jest.fn().mockResolvedValue(undefined),
    };
    auditLogService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    jest.clearAllMocks();
    repository.startSession.mockResolvedValue(sessionMock);
    sessionMock.startTransaction.mockReset();
    sessionMock.commitTransaction.mockResolvedValue(undefined);
    sessionMock.abortTransaction.mockResolvedValue(undefined);
    sessionMock.endSession.mockReset();

    service = new QS(
      repository,
      {} as any,
      provaRepository,
      {} as any,
      {} as any,
      {} as any,
      auditLogService,
      simuladoService,
      {} as any,
    );
  });

  it('bloqueia remover o último vínculo', async () => {
    repository.findProvasContendo.mockResolvedValue([
      { _id: 'p1', simulados: [] },
    ] as any);
    await expect(service.removerDeProva('q1', 'p1')).rejects.toThrow();
  });

  it('bloqueia quando a prova não contém a questão', async () => {
    repository.findProvasContendo.mockResolvedValue([
      { _id: 'p1', simulados: [] },
      { _id: 'p2', simulados: [] },
    ] as any);
    await expect(service.removerDeProva('q1', 'pX')).rejects.toThrow();
  });

  it('remove de prova+simulados e zera provaBase quando era a base', async () => {
    const questao = { _id: 'q1', status: 'Approved', provaBase: 'p1' } as any;
    repository.findProvasContendo.mockResolvedValue([
      { _id: 'p1', simulados: [{ _id: 's1' }] },
      { _id: 'p2', simulados: [] },
    ] as any);
    repository.getByIdToUpdate.mockResolvedValue(questao);

    await service.removerDeProva('q1', 'p1');

    expect(simuladoService.removeQuestionSimulados).toHaveBeenCalled();
    expect(provaRepository.removeQuestion).toHaveBeenCalledWith(
      'p1',
      questao,
      expect.anything(),
    );
    expect(repository.setProvaBase).toHaveBeenCalledWith(
      'q1',
      null,
      expect.anything(),
    );
  });

  it('não mexe em provaBase quando a prova removida não é a base', async () => {
    const questao = { _id: 'q1', status: 'Pending', provaBase: 'p2' } as any;
    repository.findProvasContendo.mockResolvedValue([
      { _id: 'p1', simulados: [] },
      { _id: 'p2', simulados: [] },
    ] as any);
    repository.getByIdToUpdate.mockResolvedValue(questao);

    await service.removerDeProva('q1', 'p1');

    expect(repository.setProvaBase).not.toHaveBeenCalled();
  });
});

describe('QuestaoService.definirProvaBase', () => {
  const { QuestaoService: QS } = require('./questao.service');

  let repository: any;
  let auditLogService: any;
  let service: any;

  beforeEach(() => {
    repository = {
      provaContemQuestao: jest.fn(),
      setProvaBase: jest.fn().mockResolvedValue(undefined),
    };
    auditLogService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    service = new QS(
      repository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogService,
      {} as any,
      {} as any,
    );
  });

  it('rejeita prova fora de provasContendo', async () => {
    repository.provaContemQuestao.mockResolvedValue(false);
    await expect(service.definirProvaBase('q1', 'p9')).rejects.toThrow();
  });

  it('seta provaBase e audita', async () => {
    repository.provaContemQuestao.mockResolvedValue(true);
    await service.definirProvaBase('q1', 'p1');
    expect(repository.setProvaBase).toHaveBeenCalledWith('q1', 'p1');
    expect(auditLogService.create).toHaveBeenCalled();
  });
});

describe('QuestaoService.updateClassificacao — área × TODAS as provas (area-enem 01)', () => {
  const questao: any = {
    _id: 'q1',
    enemArea: 'Linguagens',
    frente1: { _id: { toString: () => 'f1' } },
    alternativa: 'A',
  };
  const enemDia1 = {
    _id: 'p1',
    nome: 'ENEM 2026 Dia 1',
    enemAreas: ['Linguagens', 'Ciências Humanas'],
  };
  const custom = {
    _id: 'p9',
    nome: 'Simulado do cursinho',
    enemAreas: [] as string[],
  };

  const montar = (provas: unknown[]) => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      findProvasContendo: jest.fn().mockResolvedValue(provas),
      updateClassificacao: jest.fn(),
    };
    const provaFactory: any = { getFactory: jest.fn() };
    const service = new QuestaoService(
      repository,
      {} as any,
      { getById: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { create: jest.fn() } as any,
      {} as any,
      provaFactory,
    );
    return { service, repository, provaFactory };
  };

  it('⚠️ recusa mudar a área editando pelo vínculo da CUSTOMIZADA se a ENEM não aceita', async () => {
    const { service, repository, provaFactory } = montar([enemDia1, custom]);

    await expect(
      service.updateClassificacao('q1', {
        prova: 'p9',
        enemArea: 'Matemática',
        frente1: 'f1',
        materia: 'm1',
      } as any),
    ).rejects.toThrow(/não é permitida na prova ENEM 2026 Dia 1/);
    // ⚠️ Antes de qualquer escrita.
    expect(provaFactory.getFactory).not.toHaveBeenCalled();
    expect(repository.updateClassificacao).not.toHaveBeenCalled();
  });
});

/** Uma prova qualquer, sem restrição de área — a questão "está em prova". */
const EM_PROVA = { _id: 'p1', nome: 'Prova 1', enemAreas: [] as string[] };

describe('QuestaoService.updateClassificacao', () => {
  const questao: any = {
    _id: 'q1',
    enemArea: 'Mat',
    frente1: { _id: { toString: () => 'f1' } },
    alternativa: 'A',
  };

  it('numero-only: chama syncNumero e NAO a factory', async () => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      // ⚠️ area-enem 02: o caminho é decidido pelas provas da questão.
      findProvasContendo: jest.fn().mockResolvedValue([EM_PROVA]),
      updateClassificacao: jest.fn().mockResolvedValue(undefined),
      provaContemQuestao: jest.fn().mockResolvedValue(true),
    };
    const provaService: any = {
      syncNumero: jest.fn().mockResolvedValue(undefined),
    };
    const provaFactory: any = { getFactory: jest.fn() };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      provaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      /*
        ⚠️ Card 24: o `updateClassificacao` passou a registrar QUAIS campos
        mudaram, para medir a frequência de edição — ver `camposAlterados.ts`.
        Um `{}` aqui estoura com "create is not a function", e o `catch` do
        método transforma isso num 400 que parece falha de validação.
      */
      { create: jest.fn() } as any,
      {} as any,
      provaFactory,
    );

    await service.updateClassificacao('q1', {
      prova: 'p1',
      enemArea: 'Mat',
      frente1: 'f1',
      materia: 'm1',
      numero: 7,
    } as any);

    expect(repository.provaContemQuestao).toHaveBeenCalledWith('p1', 'q1');
    expect(provaService.syncNumero).toHaveBeenCalledWith('p1', 'q1', 7);
    expect(provaFactory.getFactory).not.toHaveBeenCalled();
    expect(repository.updateClassificacao).toHaveBeenCalledWith(
      'q1',
      expect.anything(),
    );
  });

  it('numero ausente (undefined): não mexe no numero', async () => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      // ⚠️ area-enem 02: o caminho é decidido pelas provas da questão.
      findProvasContendo: jest.fn().mockResolvedValue([EM_PROVA]),
      updateClassificacao: jest.fn().mockResolvedValue(undefined),
      provaContemQuestao: jest.fn().mockResolvedValue(true),
    };
    const provaService: any = { syncNumero: jest.fn() };
    const provaFactory: any = { getFactory: jest.fn() };
    const service = new QuestaoService(
      repository,
      provaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      /*
        ⚠️ Card 24: o `updateClassificacao` passou a registrar QUAIS campos
        mudaram, para medir a frequência de edição — ver `camposAlterados.ts`.
        Um `{}` aqui estoura com "create is not a function", e o `catch` do
        método transforma isso num 400 que parece falha de validação.
      */
      { create: jest.fn() } as any,
      {} as any,
      provaFactory,
    );

    await service.updateClassificacao('q1', {
      prova: 'p1',
      enemArea: 'Mat',
      frente1: 'f1',
      materia: 'm1',
    } as any);

    expect(provaService.syncNumero).not.toHaveBeenCalled();
    expect(repository.updateClassificacao).toHaveBeenCalledWith(
      'q1',
      expect.anything(),
    );
  });

  it('numero-only: falha alto se a prova enviada não contém a questão', async () => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      // ⚠️ area-enem 02: o caminho é decidido pelas provas da questão.
      findProvasContendo: jest.fn().mockResolvedValue([EM_PROVA]),
      updateClassificacao: jest.fn().mockResolvedValue(undefined),
      provaContemQuestao: jest.fn().mockResolvedValue(false),
    };
    const provaService: any = { syncNumero: jest.fn() };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      provaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateClassificacao('q1', {
        prova: 'p1',
        enemArea: 'Mat',
        frente1: 'f1',
        materia: 'm1',
        numero: 7,
      } as any),
    ).rejects.toBeTruthy();

    expect(provaService.syncNumero).not.toHaveBeenCalled();
    expect(repository.updateClassificacao).not.toHaveBeenCalled();
  });

  it('numero explicitamente null: chama syncNumero com null (limpar número)', async () => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      // ⚠️ area-enem 02: o caminho é decidido pelas provas da questão.
      findProvasContendo: jest.fn().mockResolvedValue([EM_PROVA]),
      updateClassificacao: jest.fn().mockResolvedValue(undefined),
      provaContemQuestao: jest.fn().mockResolvedValue(true),
    };
    const provaService: any = {
      syncNumero: jest.fn().mockResolvedValue(undefined),
    };
    const provaFactory: any = { getFactory: jest.fn() };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      provaService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      /*
        ⚠️ Card 24: o `updateClassificacao` passou a registrar QUAIS campos
        mudaram, para medir a frequência de edição — ver `camposAlterados.ts`.
        Um `{}` aqui estoura com "create is not a function", e o `catch` do
        método transforma isso num 400 que parece falha de validação.
      */
      { create: jest.fn() } as any,
      {} as any,
      provaFactory,
    );

    await service.updateClassificacao('q1', {
      prova: 'p1',
      enemArea: 'Mat',
      frente1: 'f1',
      materia: 'm1',
      numero: null,
    } as any);

    expect(repository.provaContemQuestao).toHaveBeenCalledWith('p1', 'q1');
    expect(provaService.syncNumero).toHaveBeenCalledWith('p1', 'q1', null);
    expect(provaFactory.getFactory).not.toHaveBeenCalled();
    expect(repository.updateClassificacao).toHaveBeenCalledWith(
      'q1',
      expect.anything(),
    );
  });

  it('enemArea mudou: dispara factory.updateQuestion e NAO syncNumero', async () => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      // ⚠️ area-enem 02: o caminho é decidido pelas provas da questão.
      findProvasContendo: jest.fn().mockResolvedValue([EM_PROVA]),
      updateClassificacao: jest.fn().mockResolvedValue(undefined),
    };
    const provaService: any = { syncNumero: jest.fn() };
    const provaRepository: any = {
      getById: jest
        .fn()
        .mockResolvedValue({ _id: 'p1', categoria: {}, ano: 2020 }),
    };
    const factory: any = {
      updateQuestion: jest.fn().mockResolvedValue(undefined),
    };
    const provaFactory: any = {
      getFactory: jest.fn().mockReturnValue(factory),
    };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,
      provaService,
      provaRepository,
      {} as any,
      {} as any,
      {} as any,
      // ⚠️ Card 24 — ver o comentário nos outros testes deste bloco.
      { create: jest.fn() } as any,
      {} as any,
      provaFactory,
    );

    await service.updateClassificacao('q1', {
      prova: 'p1',
      enemArea: 'Ling',
      frente1: 'f1',
      materia: 'm1',
      numero: 3,
    } as any);

    expect(factory.updateQuestion).toHaveBeenCalled();
    expect(provaService.syncNumero).not.toHaveBeenCalled();
    expect(repository.updateClassificacao).toHaveBeenCalledWith(
      'q1',
      expect.anything(),
    );
  });
});

describe('QuestaoService — log de edição de conteúdo (card 24)', () => {
  const questao = (over: Record<string, unknown> = {}) => ({
    _id: 'q1',
    textoQuestao: 'antes',
    pergunta: 'p',
    textoAlternativaA: 'a',
    textoAlternativaB: 'b',
    textoAlternativaC: 'c',
    textoAlternativaD: 'd',
    textoAlternativaE: 'e',
    alternativa: 'A',
    quantidadeResposta: 0,
    ...over,
  });

  const conteudo = (over: Record<string, unknown> = {}) => ({
    textoQuestao: 'antes',
    pergunta: 'p',
    textoAlternativaA: 'a',
    textoAlternativaB: 'b',
    textoAlternativaC: 'c',
    textoAlternativaD: 'd',
    textoAlternativaE: 'e',
    alternativa: 'A',
    textClassification: true,
    alternativeClassfication: true,
    ...over,
  });

  const montar = (doc: Record<string, unknown>) => {
    const auditLogService = { create: jest.fn().mockResolvedValue({}) };
    const repository = {
      getById: jest.fn().mockResolvedValue(doc),
      updateContent: jest.fn().mockResolvedValue(undefined),
      updateAssets: jest.fn().mockResolvedValue(undefined),
    };
    const service = new QuestaoService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogService as any,
      {} as any,
      {} as any,
    );
    return { service, auditLogService };
  };

  const registro = (auditLogService: { create: jest.Mock }) =>
    JSON.parse(auditLogService.create.mock.calls[0][0].changes);

  it('grava QUAIS campos mudaram', async () => {
    const { service, auditLogService } = montar(questao());

    await service.updateContent(
      'q1',
      conteudo({ textoQuestao: 'depois' }) as any,
    );

    expect(registro(auditLogService).campos).toEqual(['textoQuestao']);
    expect(auditLogService.create.mock.calls[0][0]).toMatchObject({
      entityId: 'q1',
      entityType: 'Questao',
    });
  });

  it('⚠️ save que não altera nada NÃO gera registro', async () => {
    /*
      É o ponto do card: contá-lo inflaria o número que o card 26 vai usar para
      decidir se o versionamento se paga.
    */
    const { service, auditLogService } = montar(questao());

    await service.updateContent('q1', conteudo() as any);

    expect(auditLogService.create).not.toHaveBeenCalled();
  });

  it('⚠️ o CONTEÚDO não é gravado — só os nomes dos campos', async () => {
    /*
      Gravar o texto antigo aqui seria versionamento pela porta dos fundos, com
      as decisões do card 26 tomadas por omissão. Este teste existe para ninguém
      "melhorar" isso depois.
    */
    const { service, auditLogService } = montar(questao());

    await service.updateContent(
      'q1',
      conteudo({ textoQuestao: 'texto novo secreto' }) as any,
    );

    const changes = auditLogService.create.mock.calls[0][0].changes;
    expect(changes).not.toContain('texto novo secreto');
    expect(changes).not.toContain('antes');
  });

  it('⚠️ marca se a questão JÁ tinha resposta — é a pergunta do card', async () => {
    const { service, auditLogService } = montar(
      questao({ quantidadeResposta: 12 }),
    );

    await service.updateContent('q1', conteudo({ alternativa: 'C' }) as any);

    expect(registro(auditLogService).respondida).toBe(true);
  });

  it('questão nunca respondida marca `respondida: false`', async () => {
    const { service, auditLogService } = montar(questao());

    await service.updateContent('q1', conteudo({ alternativa: 'C' }) as any);

    expect(registro(auditLogService).respondida).toBe(false);
  });

  it('⚠️ trocar o GABARITO é registrado — é o caso mais grave', async () => {
    // Muda quem acertou, e é de onde nasce o card 28 (recorreção).
    const { service, auditLogService } = montar(questao());

    await service.updateContent('q1', conteudo({ alternativa: 'E' }) as any);

    expect(registro(auditLogService).campos).toEqual(['alternativa']);
  });

  it('o `userId` atravessa quando o client manda', async () => {
    const { service, auditLogService } = montar(questao());

    await service.updateContent(
      'q1',
      conteudo({ textoQuestao: 'x', userId: 'u-9' }) as any,
    );

    expect(auditLogService.create.mock.calls[0][0].user).toBe('u-9');
  });

  it('⚠️ sem `userId` o log é gravado mesmo assim', async () => {
    /*
      O client ainda não manda nestas rotas, e exigi-lo quebraria a edição até o
      deploy do outro lado. O log existe para medir FREQUÊNCIA, e essa pergunta
      se responde sem o autor.
    */
    const { service, auditLogService } = montar(questao());

    await service.updateContent('q1', conteudo({ textoQuestao: 'x' }) as any);

    expect(auditLogService.create).toHaveBeenCalledTimes(1);
    expect(auditLogService.create.mock.calls[0][0].user).toBeUndefined();
  });

  it('⚠️ edição que FALHA não vira registro', async () => {
    // Log de uma edição que o banco recusou faria o card 26 ler como alteração
    // algo que nunca aconteceu.
    const { service, auditLogService } = montar(questao());
    (service as any).repository.updateContent = jest
      .fn()
      .mockRejectedValue(new Error('caiu'));

    await expect(
      service.updateContent('q1', conteudo({ textoQuestao: 'x' }) as any),
    ).rejects.toThrow();

    expect(auditLogService.create).not.toHaveBeenCalled();
  });
});

describe('QuestaoService.duplicar (card 25)', () => {
  const original = {
    _id: 'q1',
    textoQuestao: 'enunciado',
    alternativa: 'C',
    status: 'Approved',
    acertos: 8,
    quantidadeResposta: 10,
  };

  const montar = (doc: unknown = original) => {
    const auditLogService = { create: jest.fn().mockResolvedValue({}) };
    const repository = {
      getParaDuplicar: jest.fn().mockResolvedValue(doc),
      create: jest.fn((d) => Promise.resolve({ ...d, _id: 'q2' })),
    };
    const service = new QuestaoService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogService as any,
      {} as any,
      {} as any,
    );
    return { service, repository, auditLogService };
  };

  it('cria a cópia com lastro e devolve o documento novo', async () => {
    const { service, repository } = montar();

    const copia = await service.duplicar('q1');

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect((copia as { origem?: string }).origem).toBe('q1');
    // ⚠️ Card 32: duplicar produz CÓPIA — a mesma função serve a versão.
    expect((copia as { tipoOrigem?: string }).tipoOrigem).toBe('copia');
  });

  it('⚠️ a ORIGINAL não é tocada', async () => {
    /*
      Duplicar é uma ação sobre a NOVA questão: nem o conteúdo, nem os
      contadores, nem o vínculo com prova nenhuma da original mudam.
    */
    const { service, repository } = montar();

    await service.duplicar('q1');

    expect(repository).not.toHaveProperty('updateContent');
    // o único write é o `create` da cópia
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('⚠️ a cópia nasce com as estatísticas em zero', async () => {
    const { service, repository } = montar();

    await service.duplicar('q1');

    expect(repository.create.mock.calls[0][0]).toMatchObject({
      acertos: 0,
      quantidadeResposta: 0,
      quantidadeSimulado: 0,
    });
  });

  it('questão inexistente dá 404, e não cria nada', async () => {
    const { service, repository } = montar(null);

    await expect(service.duplicar('q1')).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('⚠️ o log fica na ORIGINAL, não na cópia', async () => {
    /*
      Quem vai procurar o rastro abre a questão de onde a cópia saiu, e o
      `getLogs` é por `entityId`. Na cópia o lastro já está no campo `origem`.
    */
    const { service, auditLogService } = montar();

    await service.duplicar('q1', 'u-9');

    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'q1', user: 'u-9' }),
    );
    expect(
      JSON.parse(auditLogService.create.mock.calls[0][0].changes),
    ).toMatchObject({ acao: 'duplicar', copia: 'q2' });
  });

  it('⚠️ lê com o gabarito — ele é `select: false` e sairia de fora', async () => {
    // Uma leitura comum devolve a questão sem `alternativa`, e a cópia nasceria
    // sem gabarito em silêncio.
    const { service, repository } = montar();

    await service.duplicar('q1');

    expect(repository.getParaDuplicar).toHaveBeenCalledWith('q1');
    expect(repository.create.mock.calls[0][0].alternativa).toBe('C');
  });
});

describe('QuestaoService.novaVersao (card 26)', () => {
  const original = (over: Record<string, unknown> = {}) => ({
    _id: 'q1',
    textoQuestao: 'antes',
    alternativa: 'A',
    quantidadeResposta: 12,
    congelada: false,
    ...over,
  });

  const conteudo = {
    textoQuestao: 'depois',
    textoAlternativaA: 'a',
    textoAlternativaB: 'b',
    textoAlternativaC: 'c',
    textoAlternativaD: 'd',
    textoAlternativaE: 'e',
    alternativa: 'A',
    textClassification: true,
    alternativeClassfication: true,
  };

  const montar = (doc: unknown = original()) => {
    const ordem: string[] = [];
    const auditLogService = { create: jest.fn().mockResolvedValue({}) };
    const repository = {
      getParaDuplicar: jest.fn().mockResolvedValue(doc),
      create: jest.fn((d) => {
        ordem.push('create');
        return Promise.resolve({ ...d, _id: 'q2' });
      }),
      updateContent: jest.fn(() => {
        ordem.push('updateContent');
        return Promise.resolve(undefined);
      }),
      substituirQuestao: jest.fn(() => {
        ordem.push('substituir');
        return Promise.resolve({ provas: 3, simulados: 5 });
      }),
      congelar: jest.fn(() => {
        ordem.push('congelar');
        return Promise.resolve(undefined);
      }),
      getById: jest.fn().mockResolvedValue(doc),
      updateAssets: jest.fn(),
    };
    const service = new QuestaoService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogService as any,
      {} as any,
      {} as any,
    );
    return { service, repository, auditLogService, ordem };
  };

  it('⚠️ TODAS as provas e simulados passam a apontar a sucessora', async () => {
    /*
      É o que distingue versionar de duplicar (card 25): lá a cópia nasce órfã e
      as provas não mudam. Aqui, sem a troca, a próxima aplicação usaria o texto
      que acabou de ser considerado errado.

      ⚠️ E medido no card 22: uma questão está em 2,7 simulados em média — a
      troca é sempre multi-prova, nunca "a prova que eu estava editando".
    */
    const { service, repository } = montar();

    await service.novaVersao('q1', conteudo as any);

    expect(repository.substituirQuestao).toHaveBeenCalledWith('q1', 'q2');
  });

  it('⚠️ a ordem protege o pior estado possível', async () => {
    /*
      Congelar antes de a sucessora existir deixaria a questão inalcançável para
      edição E sem substituta — irreversível pela própria tela. Por isso
      congelar é o ÚLTIMO passo.
    */
    const { service, ordem } = montar();

    await service.novaVersao('q1', conteudo as any);

    expect(ordem).toEqual([
      'create',
      'updateContent',
      'substituir',
      'congelar',
    ]);
  });

  it('a sucessora nasce com as estatísticas zeradas', async () => {
    const { service, repository } = montar();

    await service.novaVersao('q1', conteudo as any);

    expect(repository.create.mock.calls[0][0]).toMatchObject({
      acertos: 0,
      quantidadeResposta: 0,
      origem: 'q1',
    });
  });

  it('⚠️ a sucessora é marcada como VERSÃO, não como cópia (card 32)', async () => {
    const { service, repository } = montar();

    await service.novaVersao('q1', conteudo as any);

    expect(repository.create.mock.calls[0][0].tipoOrigem).toBe('versao');
  });

  it('o conteúdo novo é escrito na SUCESSORA, não na original', async () => {
    const { service, repository } = montar();

    await service.novaVersao('q1', conteudo as any);

    expect(repository.updateContent).toHaveBeenCalledWith('q2', conteudo);
  });

  it('⚠️ questão já congelada recusa, e não cria uma segunda sucessora', async () => {
    const { service, repository } = montar(original({ congelada: true }));

    await expect(service.novaVersao('q1', conteudo as any)).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('questão inexistente dá 404 sem tocar em nada', async () => {
    const { service, repository } = montar(null);

    await expect(service.novaVersao('q1', conteudo as any)).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.congelar).not.toHaveBeenCalled();
  });

  it('o log registra quantas provas e simulados foram atingidos', async () => {
    const { service, auditLogService } = montar();

    await service.novaVersao('q1', conteudo as any, 'u-9');

    expect(
      JSON.parse(auditLogService.create.mock.calls[0][0].changes),
    ).toMatchObject({
      acao: 'novaVersao',
      sucessora: 'q2',
      provas: 3,
      simulados: 5,
    });
    expect(auditLogService.create.mock.calls[0][0].entityId).toBe('q1');
  });
});

describe('QuestaoService.updateContent — questão congelada (card 26)', () => {
  it('⚠️ recusa a edição, em vez de aceitar em silêncio', async () => {
    /*
      A questão congelada é o que algum histórico aponta: mudá-la reescreveria o
      enunciado de uma prova já aplicada. E `BadRequest`, não no-op — a tela
      precisa da recusa para oferecer "criar nova versão".
    */
    const repository = {
      getById: jest.fn().mockResolvedValue({ _id: 'q1', congelada: true }),
      updateContent: jest.fn(),
    };
    const service = new QuestaoService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { create: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateContent('q1', { textoQuestao: 'x' } as any),
    ).rejects.toThrow();
    expect(repository.updateContent).not.toHaveBeenCalled();
  });
});

describe('QuestaoService.linhagem (card 34A)', () => {
  const no = (id: string, over: Record<string, unknown> = {}) => ({
    _id: id,
    status: 0,
    congelada: false,
    origem: null as string | null,
    tipoOrigem: null as string | null,
    textoQuestao: `enunciado ${id}`,
    ...over,
  });

  const montar = (banco: Record<string, any>) => {
    const repository = {
      noDaLinhagem: jest.fn(async (id: string) => banco[id] ?? null),
      sucessoraDe: jest.fn(
        async (id: string) =>
          Object.values(banco).find(
            (q: any) => q.origem === id && q.tipoOrigem === 'versao',
          ) ?? null,
      ),
      copiasDe: jest.fn(async (id: string) =>
        Object.values(banco).filter(
          (q: any) => q.origem === id && q.tipoOrigem !== 'versao',
        ),
      ),
      findProvasContendoMany: jest.fn(async () => new Map([['v2', [{}, {}]]])),
    };
    const service = new QuestaoService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, repository };
  };

  const banco = {
    v1: no('v1', { congelada: true }),
    v2: no('v2', { origem: 'v1', tipoOrigem: 'versao' }),
    c1: no('c1', { origem: 'v2', tipoOrigem: 'copia' }),
  };

  it('versões, cópias e origem numa resposta só', async () => {
    const { service } = montar(banco);

    const r = await service.linhagem('v2');

    expect(r.atual).toBe('v2');
    expect(r.versoes.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(r.copias.map((c) => c.id)).toEqual(['c1']);
    // ⚠️ v2 é VERSÃO de v1, não cópia: não tem "origem de cópia".
    expect(r.origemCopia).toBeNull();
  });

  it('a cópia vê de quem é cópia, e não tem cadeia de versões', async () => {
    const { service } = montar(banco);

    const r = await service.linhagem('c1');

    expect(r.origemCopia?.id).toBe('v2');
    expect(r.versoes).toEqual([]);
  });

  it('cada item diz o que identifica a questão', async () => {
    const { service } = montar(banco);

    const r = await service.linhagem('v2');

    expect(r.versoes[0]).toEqual({
      id: 'v1',
      status: 0,
      congelada: true,
      enunciado: 'enunciado v1',
      provas: 0,
    });
    expect(r.versoes[1].provas).toBe(2);
  });

  it('⚠️ as provas de todos os itens vêm numa consulta só', async () => {
    const { service, repository } = montar(banco);

    await service.linhagem('v2');

    expect(repository.findProvasContendoMany).toHaveBeenCalledTimes(1);
    expect(repository.findProvasContendoMany).toHaveBeenCalledWith([
      'v1',
      'v2',
      'c1',
    ]);
  });

  it('inexistente ou excluída: 404', async () => {
    const { service } = montar({});

    await expect(service.linhagem('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('QuestaoService.updateClassificacao — questão SEM prova (area-enem 02)', () => {
  const questao: any = {
    _id: 'q1',
    enemArea: 'Linguagens',
    frente1: { _id: { toString: () => 'f1' } },
    alternativa: 'A',
  };
  const corpo = (over: Record<string, unknown> = {}) =>
    ({
      enemArea: 'Matemática',
      frente1: 'f2',
      materia: 'm2',
      ...over,
    }) as any;

  const montar = (provas: unknown[]) => {
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(questao),
      findProvasContendo: jest.fn().mockResolvedValue(provas),
      updateClassificacao: jest.fn().mockResolvedValue(undefined),
      provaContemQuestao: jest.fn(),
    };
    const provaService: any = { syncNumero: jest.fn() };
    const provaRepository: any = { getById: jest.fn() };
    const auditLogService: any = { create: jest.fn() };
    const provaFactory: any = { getFactory: jest.fn() };
    const service = new QuestaoService(
      repository,
      provaService,
      provaRepository,
      {} as any,
      {} as any,
      {} as any,
      auditLogService,
      {} as any,
      provaFactory,
    );
    return { service, repository, provaService, provaFactory, auditLogService };
  };

  it('⚠️ sem prova: só salva — nem fábrica, nem syncNumero', async () => {
    /*
      Sem prova não há simulado para reposicionar nem posição para sincronizar.
      Antes, o DTO exigia `prova` e a cópia recém-duplicada (que nasce sem
      prova) não conseguia ser reclassificada.
    */
    const { service, repository, provaService, provaFactory } = montar([]);

    await service.updateClassificacao('q1', corpo());

    expect(repository.updateClassificacao).toHaveBeenCalledWith(
      'q1',
      expect.objectContaining({ enemArea: 'Matemática', frente1: 'f2' }),
    );
    expect(provaFactory.getFactory).not.toHaveBeenCalled();
    expect(provaService.syncNumero).not.toHaveBeenCalled();
  });

  it('sem prova: o log de edição (card 24) continua', async () => {
    const { service, auditLogService } = montar([]);

    await service.updateClassificacao('q1', corpo());

    expect(auditLogService.create).toHaveBeenCalled();
  });

  it('⚠️ quem decide é o ESTADO da questão — em prova e corpo sem `prova`: 400', async () => {
    /*
      Decidir pela ausência de `prova` no corpo deixaria um client antigo, ou um
      bug, mandar sem prova uma questão que ESTÁ em prova — e pular a fábrica
      que reposiciona os simulados.
    */
    const { service, repository, provaFactory } = montar([EM_PROVA]);

    await expect(service.updateClassificacao('q1', corpo())).rejects.toThrow(
      /Informe a prova/,
    );
    expect(repository.updateClassificacao).not.toHaveBeenCalled();
    expect(provaFactory.getFactory).not.toHaveBeenCalled();
  });

  it('sem prova e corpo COM `prova`: 400 — a questão não está nela', async () => {
    const { service, repository } = montar([]);

    await expect(
      service.updateClassificacao('q1', corpo({ prova: 'p7' })),
    ).rejects.toThrow(/não está em prova nenhuma/);
    expect(repository.updateClassificacao).not.toHaveBeenCalled();
  });
});
