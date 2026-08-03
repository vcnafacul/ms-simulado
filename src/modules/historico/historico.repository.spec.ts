import { HistoricoRepository } from './historico.repository';

describe('HistoricoRepository.getById (popula simulado.questoesNovo.questao)', () => {
  it('popula simulado com tipo + questoesNovo.questao (sem questoes)', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'h1' });
    const populate = jest.fn().mockReturnValue({ exec });
    const findById = jest.fn().mockReturnValue({ populate });
    const repo = new HistoricoRepository({ findById } as any);

    await repo.getById('h1');

    expect(findById).toHaveBeenCalledWith('h1');
    expect(populate).toHaveBeenCalledWith({
      path: 'simulado',
      populate: ['tipo', { path: 'questoesNovo.questao' }],
    });
  });
});
