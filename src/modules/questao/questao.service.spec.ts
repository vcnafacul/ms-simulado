import { HttpException, HttpStatus } from '@nestjs/common';
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
  getById: jest.fn().mockResolvedValue({ _id: 'prova-id', categoria: { exame: {} }, ano: 2023 }),
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

function makeCreateDto(numero: number | null | undefined): CreateQuestaoDTOInput {
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

describe('QuestaoService.delete (reverse-lookup provas contendo a questão)', () => {
  it('remove a questão das provas/simulados que a contêm e deleta', async () => {
    const question: any = { _id: 'q1', status: 'pending' };
    const prova: any = { _id: 'pr1', simulados: [{ _id: 's1' }] };
    const session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      abortTransaction: jest.fn().mockResolvedValue(undefined),
      endSession: jest.fn(),
    };
    const repository: any = {
      getByIdToDelete: jest.fn().mockResolvedValue(question),
      startSession: jest.fn().mockResolvedValue(session),
      delete: jest.fn().mockResolvedValue(undefined),
      findProvasContendo: jest.fn().mockResolvedValue([prova]),
    };
    const simuladoService: any = { removeQuestionSimulados: jest.fn().mockResolvedValue(undefined) };
    const provaRepository: any = { removeQuestion: jest.fn().mockResolvedValue(undefined) };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository,        // repository
      {} as any,         // provaService
      provaRepository,   // provaRepository
      {} as any,         // exameRepository
      {} as any,         // materiaRepository
      {} as any,         // frenteRepository
      {} as any,         // auditLogService
      simuladoService,   // simuladoService
      {} as any,         // provaFactory
    );

    await service.delete('q1');

    expect(simuladoService.removeQuestionSimulados).toHaveBeenCalledWith([{ _id: 's1' }], question, session);
    expect(provaRepository.removeQuestion).toHaveBeenCalledWith('pr1', question);
    expect(repository.delete).toHaveBeenCalledWith('q1');
    expect(session.commitTransaction).toHaveBeenCalled();
  });
});

describe('QuestaoService.updateStatus (reverse-lookup provas)', () => {
  it('aprova a questão em cada prova que a contém', async () => {
    const question: any = { _id: 'q1', status: 0 };
    const repository: any = {
      getByIdToUpdate: jest.fn().mockResolvedValue(question),
      UpdateStatus: jest.fn().mockResolvedValue(undefined),
      findProvasContendo: jest.fn().mockResolvedValue([{ _id: 'pr1' }, { _id: 'pr2' }]),
    };
    const provaService: any = { approvedQuestion: jest.fn().mockResolvedValue(undefined), refuseQuestion: jest.fn() };
    const auditLogService: any = { create: jest.fn().mockResolvedValue(undefined) };
    const { QuestaoService } = require('./questao.service');
    const service = new QuestaoService(
      repository, provaService, {} as any, {} as any, {} as any, {} as any, auditLogService, {} as any, {} as any,
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
      repository, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    await expect(service.updateStatus('q1', Status.Approved, 'user1')).rejects.toBeTruthy();
  });
});
