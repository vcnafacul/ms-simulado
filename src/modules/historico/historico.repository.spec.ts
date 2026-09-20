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

  it('marcarFalha grava status e falha na MESMA escrita', async () => {
    const exec = jest.fn().mockResolvedValue(undefined);
    const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ findByIdAndUpdate } as any);

    await repo.marcarFalha('h1', 'cartao_nao_detectado', 'sem CSV de Results');

    // uma chamada só: em duas escritas existe uma janela mostrando o status novo
    // com a falha velha ao lado — é o que o card 09 precisa evitar na volta
    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(findByIdAndUpdate).toHaveBeenCalledWith('h1', {
      status: 'failed',
      falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV de Results' },
    });
  });

  it('marcarFalha aceita falha sem detalhe', async () => {
    const exec = jest.fn().mockResolvedValue(undefined);
    const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ findByIdAndUpdate } as any);

    await repo.marcarFalha('h1', 'simulado_nao_encontrado');

    expect(findByIdAndUpdate).toHaveBeenCalledWith('h1', {
      status: 'failed',
      falha: { codigo: 'simulado_nao_encontrado', detalhe: undefined },
    });
  });
});

describe('HistoricoRepository.reabrirParaOmr', () => {
  // dublê local do bloco, no mesmo formato dos testes acima (findByIdAndUpdate
  // encadeando um `exec`); só fica num helper porque os dois testes daqui
  // precisam inspecionar o `update` que chegou.
  const montar = () => {
    const exec = jest.fn().mockResolvedValue(undefined);
    const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ findByIdAndUpdate } as any);
    return { repo, findByIdAndUpdate };
  };

  it('⚠️ muda status, chave e tentativa E apaga a falha na MESMA escrita', async () => {
    // Em duas escritas existe uma janela em que a tela mostra "processando"
    // com a mensagem de erro anterior ao lado. O docblock do `marcarFalha`
    // registra isso desde o card 01.
    const { repo, findByIdAndUpdate } = montar();

    await repo.reabrirParaOmr('h1', {
      imageKey: 'cartoes/abc/nova.jpg',
      quando: new Date('2026-09-20T10:00:00Z'),
    });

    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({
      status: 'awaiting_omr',
      imageKey: 'cartoes/abc/nova.jpg',
      ultimaTentativaEm: new Date('2026-09-20T10:00:00Z'),
    });
    expect(update.$unset).toHaveProperty('falha');
  });

  it('sem imageKey nova, a chave atual é preservada', async () => {
    // é o caminho do `reprocessar`: a foto serve, quem falhou foi a infra
    const { repo, findByIdAndUpdate } = montar();

    await repo.reabrirParaOmr('h1', { quando: new Date() });

    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('imageKey');
    expect(update.$unset).toHaveProperty('falha');
  });
});
