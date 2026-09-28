import { ForbiddenException } from '@nestjs/common';
import { Ator } from 'src/shared/ator/ator';
import { QuestaoService } from './questao.service';

/**
 * tickets/023, card 03: toda escrita na composição da prova passa antes pelo
 * `assertPodeComporProva` — e, recusada, nada é escrito.
 */
const ator: Ator = {
  userId: 'u',
  cursinhoId: 'B',
  admin: false,
  editorCursinho: true,
};

function montar(recusa: boolean) {
  const provaService = {
    assertPodeComporProva: jest.fn(async () => {
      if (recusa) throw new ForbiddenException('outro cursinho');
    }),
    syncNumero: jest.fn(),
  };
  const factory = {
    verifyNumberProva: jest.fn().mockResolvedValue(true),
    createQuestion: jest.fn(),
    addQuestaoExistenteAProva: jest.fn(),
    updateQuestion: jest.fn(),
  };
  const repository = {
    findProvasContendo: jest.fn().mockResolvedValue([
      { _id: 'pA', simulados: [] },
      { _id: 'pB', simulados: [] },
    ]),
    findProvasContendoMany: jest
      .fn()
      .mockResolvedValue(
        new Map([['q1', [{ provaId: 'pA', provaNome: 'A', numero: 5 }]]]),
      ),
    findProvaDeSaida: jest.fn().mockResolvedValue('pX'),
    provaContemQuestao: jest.fn().mockResolvedValue(false),
    getByIdToUpdate: jest.fn().mockResolvedValue({ _id: 'q1' }),
    updateClassificacao: jest.fn(),
    startSession: jest.fn(),
    setProvaBase: jest.fn(),
    create: jest.fn(),
  };
  const provaRepository = {
    getById: jest
      .fn()
      .mockResolvedValue({ _id: 'pA', categoria: {}, ano: 2024 }),
    removeQuestion: jest.fn(),
  };
  const auditLogService = { create: jest.fn() };
  const simuladoService = { removeQuestionSimulados: jest.fn() };
  const service = new QuestaoService(
    repository as any,
    provaService as any,
    provaRepository as any,
    {} as any,
    {} as any,
    {} as any,
    auditLogService as any,
    simuladoService as any,
    { getFactory: () => factory } as any,
  );
  const escritas = () =>
    [
      factory.createQuestion,
      factory.addQuestaoExistenteAProva,
      factory.updateQuestion,
      repository.updateClassificacao,
      repository.startSession,
      repository.create,
      provaRepository.removeQuestion,
      provaService.syncNumero,
      auditLogService.create,
    ].reduce((n, f) => n + f.mock.calls.length, 0);
  return { service, provaService, repository, escritas };
}

describe('recusado → nada é escrito (023 · 03)', () => {
  it('adicionarEmProva', async () => {
    const { service, provaService, escritas } = montar(true);
    await expect(
      service.adicionarEmProva('q1', 'pA', 3, undefined, ator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(provaService.assertPodeComporProva).toHaveBeenCalledWith('pA', ator);
    expect(escritas()).toBe(0);
  });

  it('removerDeProva', async () => {
    const { service, escritas } = montar(true);
    await expect(
      service.removerDeProva('q1', 'pA', undefined, ator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(escritas()).toBe(0);
  });

  it('create com prova', async () => {
    const { service, escritas } = montar(true);
    await expect(
      service.create({ prova: 'pA', numero: 1 } as any, ator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(escritas()).toBe(0);
  });

  it('create SEM prova não pergunta a ninguém', async () => {
    const { service, provaService } = montar(true);
    await service.create({ enemArea: 'x' } as any, ator);
    expect(provaService.assertPodeComporProva).not.toHaveBeenCalled();
  });

  it('PATCH v1/questao: checa o destino e a prova de onde a fábrica tira', async () => {
    const { service, provaService } = montar(false);
    await service.updateQuestionDaRota({ _id: 'q1', prova: 'pA' } as any, ator);
    expect(provaService.assertPodeComporProva.mock.calls).toEqual([
      ['pA', ator],
      ['pX', ator],
    ]);
  });

  it('PATCH v1/questao recusado', async () => {
    const { service, escritas } = montar(true);
    await expect(
      service.updateQuestionDaRota({ _id: 'q1', prova: 'pA' } as any, ator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(escritas()).toBe(0);
  });

  it('classificação trocando o número: recusada, nada escrito', async () => {
    const { service, escritas } = montar(true);
    await expect(
      service.updateClassificacao(
        'q1',
        { prova: 'pA', numero: 6 } as any,
        ator,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(escritas()).toBe(0);
  });

  it('⚠️ classificação com o MESMO número não é composição (o client sempre manda o número)', async () => {
    const { service, provaService } = montar(true);
    await service
      .updateClassificacao('q1', { prova: 'pA', numero: 5 } as any, ator)
      .catch(() => undefined); // o resto do método não é o assunto
    expect(provaService.assertPodeComporProva).not.toHaveBeenCalled();
  });

  it('classificação sem número (campo ausente): não é composição', async () => {
    const { service, provaService } = montar(true);
    await service
      .updateClassificacao('q1', { prova: 'pA' } as any, ator)
      .catch(() => undefined);
    expect(provaService.assertPodeComporProva).not.toHaveBeenCalled();
  });
});
