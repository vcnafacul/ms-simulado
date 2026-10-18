import { QuestaoService } from '../questao.service';

/** tickets/042, card 04 — remover da prova tira a entrada do espelho, na mesma transação. */
describe('removerDeProva limpa o espelho (042/04)', () => {
  it('limparEspelho recebe a sessão da remoção', async () => {
    const session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };
    const limparEspelho = jest.fn();
    const service = new QuestaoService(
      {
        findProvasContendo: jest.fn().mockResolvedValue([
          { _id: 'p1', simulados: [] },
          { _id: 'p2', simulados: [] },
        ]),
        getByIdToUpdate: jest.fn().mockResolvedValue({ _id: 'q1' }),
        startSession: jest.fn().mockResolvedValue(session),
      } as never,
      { assertPodeComporProva: jest.fn() } as never,
      { removeQuestion: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { create: jest.fn() } as never,
      { removeQuestionSimulados: jest.fn() } as never,
      {} as never,
      undefined,
      { limparEspelho } as never,
    );

    await service.removerDeProva('q1', 'p1');

    expect(limparEspelho).toHaveBeenCalledWith('q1', 'p1', session);
    expect(session.commitTransaction).toHaveBeenCalled();
  });
});
