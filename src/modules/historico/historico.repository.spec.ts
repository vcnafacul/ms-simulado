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

  it('⚠️ getByIdAndUsuario filtra pelo DONO, não só pelo id', async () => {
    // Sem o `usuario` no filtro, qualquer usuário autenticado lê o histórico
    // de qualquer outro pelo id: respostas marcadas, gabarito, aproveitamento.
    const exec = jest.fn().mockResolvedValue({ _id: 'h1' });
    const populate = jest.fn().mockReturnValue({ exec });
    const findOne = jest.fn().mockReturnValue({ populate });
    const repo = new HistoricoRepository({ findOne } as any);

    await repo.getByIdAndUsuario('h1', 'u1');

    expect(findOne).toHaveBeenCalledWith({ _id: 'h1', usuario: 'u1' });
  });

  it('getByIdAndUsuario popula o simulado igual ao getById', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'h1' });
    const populate = jest.fn().mockReturnValue({ exec });
    const findOne = jest.fn().mockReturnValue({ populate });
    const repo = new HistoricoRepository({ findOne } as any);

    await repo.getByIdAndUsuario('h1', 'u1');

    expect(populate).toHaveBeenCalledWith({
      path: 'simulado',
      populate: [{ path: 'questoes.questao' }],
    });
  });

  it('⚠️ buscarCartaoEnviado procura em QUALQUER status — o falho também conta', async () => {
    const exec = jest.fn().mockResolvedValue({ status: 'failed' });
    const findOne = jest.fn().mockReturnValue({ lean: () => ({ exec }) });
    const repo = new HistoricoRepository({ findOne } as any);

    const r = await repo.buscarCartaoEnviado(
      'u1',
      '665f0c1a2b3c4d5e6f00abc1',
      '7',
    );

    expect(r).toEqual({ status: 'failed' });
    const [filtro] = findOne.mock.calls[0];
    expect(filtro).toMatchObject({ usuario: 'u1', cartaoCode: '7' });
    expect(filtro).not.toHaveProperty('status');
  });

  it('createAwaitingOmr cria com status AwaitingOmr', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'h1' });
    const repo = new HistoricoRepository({ create } as any);
    await repo.createAwaitingOmr({
      usuario: 'u1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc1',
      imageKey: 'cartoes/665abc/i.jpg',
      cartaoCode: '7',
      tentativaId: 'T1',
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
      tentativaId: 'T2',
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

    await repo.reabrirParaOmr('h1', { quando: new Date(), tentativaId: 'T2' });

    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('imageKey');
    expect(update.$unset).toHaveProperty('falha');
  });
});

describe('HistoricoRepository.findAwaitingOmrAntigos (card 13)', () => {
  const CORTE = new Date('2026-09-20T10:00:00Z');

  const montar = () => {
    const exec = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ find } as any);
    return { repo, find };
  };

  it('filtra por status awaiting_omr', async () => {
    const { repo, find } = montar();
    await repo.findAwaitingOmrAntigos(CORTE);
    expect(find.mock.calls[0][0]).toMatchObject({ status: 'awaiting_omr' });
  });

  it('⚠️ o primeiro ramo usa ultimaTentativaEm — respeita o reprocesso', async () => {
    // Cartao criado ha 3 dias mas REENVIADO ha 1 minuto esta esperando ha 1
    // minuto, nao ha 3 dias. Sem este ramo a varredura mataria toda tentativa
    // de reprocessamento de um cartao antigo, no instante seguinte ao clique.
    const { repo, find } = montar();
    await repo.findAwaitingOmrAntigos(CORTE);

    const filtro = find.mock.calls[0][0];
    expect(filtro.$or[0]).toEqual({ ultimaTentativaEm: { $lt: CORTE } });
  });

  it('⚠️ o segundo ramo usa o _id para quem nao tem ultimaTentativaEm', async () => {
    // `createAwaitingOmr` NAO grava `ultimaTentativaEm` — so o `reabrirParaOmr`
    // grava. Sem este ramo, o cartao de primeira viagem (que e a maioria, e sao
    // justamente os presos hoje) jamais seria varrido. O ObjectId do Mongo
    // embute o timestamp de criacao, o que evita migracao.
    const { repo, find } = montar();
    await repo.findAwaitingOmrAntigos(CORTE);

    const ramo = find.mock.calls[0][0].$or[1];
    expect(ramo.ultimaTentativaEm).toEqual({ $exists: false });
    expect(ramo._id.$lt).toBeDefined();
    // o ObjectId de corte tem de representar o MESMO instante
    expect(ramo._id.$lt.getTimestamp().getTime()).toBe(CORTE.getTime());
  });

  it('devolve o que o find retornou', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'h1' }]);
    const find = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ find } as any);

    const r = await repo.findAwaitingOmrAntigos(CORTE);

    expect(r).toEqual([{ _id: 'h1' }]);
  });
});

describe('tentativaId (card 14)', () => {
  it('createAwaitingOmr grava um tentativaId', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'h1' });
    const repo = new HistoricoRepository({ create } as any);

    await repo.createAwaitingOmr({
      usuario: 'u1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc1',
      imageKey: 'cartoes/665abc/i.jpg',
      cartaoCode: '7',
      tentativaId: 'T1',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tentativaId: 'T1' }),
    );
  });

  it('⚠️ reabrirParaOmr TROCA o tentativaId', async () => {
    // E' o que faz o callback da tentativa anterior deixar de bater. Sem isto,
    // o reprocesso continua aceitando o callback velho e o card nao conserta
    // nada.
    const exec = jest.fn().mockResolvedValue(undefined);
    const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ findByIdAndUpdate } as any);

    await repo.reabrirParaOmr('h1', { quando: new Date(), tentativaId: 'T2' });

    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set.tentativaId).toBe('T2');
  });
});
