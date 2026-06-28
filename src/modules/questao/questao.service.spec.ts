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
