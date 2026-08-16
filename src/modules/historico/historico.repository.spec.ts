import { HistoricoRepository } from './historico.repository';

describe('HistoricoRepository.getById (popula simulado.questoes.questao)', () => {
  it('popula simulado com questoes.questao (sem questoes)', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'h1' });
    const populate = jest.fn().mockReturnValue({ exec });
    const findById = jest.fn().mockReturnValue({ populate });
    const repo = new HistoricoRepository({ findById } as any);

    await repo.getById('h1');

    expect(findById).toHaveBeenCalledWith('h1');
    expect(populate).toHaveBeenCalledWith({
      path: 'simulado',
      populate: [{ path: 'questoes.questao' }],
    });
  });

  it('existsCartaoAtivo consulta status ≠ Failed', async () => {
    const exists = jest.fn().mockResolvedValue({ _id: 'x' });
    const repo = new HistoricoRepository({ exists } as any);
    const r = await repo.existsCartaoAtivo(
      'u1',
      '665f0c1a2b3c4d5e6f00abc1',
      '7',
    );
    expect(r).toBe(true);
    expect(exists).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario: 'u1',
        cartaoCode: '7',
        status: { $ne: 'failed' },
      }),
    );
  });

  it('createAwaitingOmr cria com status AwaitingOmr', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'h1' });
    const repo = new HistoricoRepository({ create } as any);
    await repo.createAwaitingOmr({
      usuario: 'u1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc1',
      imageKey: 'cartoes/665abc/i.jpg',
      cartaoCode: '7',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario: 'u1',
        imageKey: 'cartoes/665abc/i.jpg',
        cartaoCode: '7',
        status: 'awaiting_omr',
      }),
    );
  });

  it('findByImageKey consulta por imageKey', async () => {
    const findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'h1' }),
    });
    const repo = new HistoricoRepository({ findOne } as any);
    const r = await repo.findByImageKey(
      'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
    );
    expect((r as any)._id).toBe('h1');
    expect(findOne).toHaveBeenCalledWith({
      imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
    });
  });

  it('prepararParaProcessamento grava rawRespostas + status Pending', async () => {
    const findByIdAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(undefined),
    });
    const repo = new HistoricoRepository({ findByIdAndUpdate } as any);
    await repo.prepararParaProcessamento('h1', [
      { questao: 'q1', alternativaEstudante: 'A' },
    ]);
    expect(findByIdAndUpdate).toHaveBeenCalledWith('h1', {
      rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
      status: 'pending',
    });
  });
});
