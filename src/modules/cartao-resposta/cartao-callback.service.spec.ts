import { CartaoCallbackService } from './cartao-callback.service';

function setup(over: any = {}) {
  const historicoRepository = {
    findByImageKey: jest
      .fn()
      .mockResolvedValue({ _id: 'h1', simulado: { _id: 's1' } }),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
    prepararParaProcessamento: jest.fn().mockResolvedValue(undefined),
    ...over.historicoRepository,
  };
  const simuladoRepository = {
    answer: jest.fn().mockResolvedValue({
      questoes: [
        { numero: 1, questao: { _id: 'idq1' } },
        { numero: 2, questao: { _id: 'idq2' } },
      ],
    }),
    ...over.simuladoRepository,
  };
  const queueProducer = {
    publish: jest.fn().mockResolvedValue('1-0'),
    ...over.queueProducer,
  };
  return {
    svc: new CartaoCallbackService(
      historicoRepository as any,
      simuladoRepository as any,
      queueProducer as any,
    ),
    historicoRepository,
    simuladoRepository,
    queueProducer,
  };
}

describe('CartaoCallbackService', () => {
  it('não encontrado: ack sem efeitos', async () => {
    const { svc, historicoRepository, queueProducer } = setup({
      historicoRepository: {
        findByImageKey: jest.fn().mockResolvedValue(null),
      },
    });
    await svc.processar({ imageKey: 'k' });
    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('falha: grava o código recebido e o detalhe, sem publish', async () => {
    const { svc, historicoRepository, queueProducer } = setup();

    await svc.processar({
      imageKey: 'k',
      falha: { motivo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
    });

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'cartao_nao_detectado',
      'sem CSV',
    );
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('falha: repassa código desconhecido cru, sem validar contra lista fechada', async () => {
    // validar aqui faria todo código novo do ms-omr exigir deploy coordenado;
    // quem absorve o desconhecido é o fallback do mapa, na leitura
    const { svc, historicoRepository } = setup();

    await svc.processar({
      imageKey: 'k',
      falha: { motivo: 'codigo_futuro_do_ms_omr' },
    });

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'codigo_futuro_do_ms_omr',
      undefined,
    );
  });

  it('callback sem falha não inventa uma', async () => {
    const { svc, historicoRepository } = setup();

    await svc.processar({
      imageKey: 'k',
      respostas: [{ questao: '1', alternativaEstudante: 'A' }],
    });

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
  });

  it('sucesso: mapeia número→_id, prepara e enfileira', async () => {
    const { svc, historicoRepository, queueProducer } = setup();
    await svc.processar({
      imageKey: 'k',
      respostas: [
        { questao: '1', alternativaEstudante: 'A' },
        { questao: '2', alternativaEstudante: 'C' },
        { questao: '99', alternativaEstudante: 'E' }, // fora do mapa → filtrado
      ],
    });
    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalledWith(
      'h1',
      [
        { questao: 'idq1', alternativaEstudante: 'A' },
        { questao: 'idq2', alternativaEstudante: 'C' },
      ],
    );
    expect(queueProducer.publish).toHaveBeenCalledWith(
      'stream:simulado:answers',
      { histId: 'h1' },
    );
  });

  it('simulado nulo (deletado): marca Failed e ack, sem publish', async () => {
    const { svc, historicoRepository, queueProducer } = setup({
      simuladoRepository: { answer: jest.fn().mockResolvedValue(null) },
    });
    await svc.processar({
      imageKey: 'k',
      respostas: [{ questao: '1', alternativaEstudante: 'A' }],
    });
    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'simulado_nao_encontrado',
      expect.any(String),
    );
    expect(
      historicoRepository.prepararParaProcessamento,
    ).not.toHaveBeenCalled();
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('⚠️ descarta alternativa que não é A–E: "", null e "AE" não são gravadas', async () => {
    // O DTO do callback valida só `@IsArray()` — a letra NÃO é validada na
    // borda. A regra de "sem leitura" da tela é a AUSÊNCIA da chave, então uma
    // letra inválida gravada viraria ERRO com a célula "Marcou" vazia.
    // Descartar aqui faz a questão cair exatamente em "sem leitura".
    const { svc, historicoRepository } = setup({
      simuladoRepository: {
        answer: jest.fn().mockResolvedValue({
          questoes: [
            { numero: 1, questao: { _id: 'idq1' } },
            { numero: 2, questao: { _id: 'idq2' } },
            { numero: 3, questao: { _id: 'idq3' } },
            { numero: 4, questao: { _id: 'idq4' } },
          ],
        }),
      },
    });

    await svc.processar({
      imageKey: 'k',
      respostas: [
        { questao: '1', alternativaEstudante: '' },
        { questao: '2', alternativaEstudante: null as any },
        { questao: '3', alternativaEstudante: 'AE' },
        { questao: '4', alternativaEstudante: 'C' },
      ],
    });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalledWith(
      'h1',
      [{ questao: 'idq4', alternativaEstudante: 'C' }],
    );

    // nada de vazio/nulo/dupla marcação chegou às respostas gravadas
    const gravadas = historicoRepository.prepararParaProcessamento.mock
      .calls[0][1] as { alternativaEstudante: string }[];
    expect(gravadas.map((r) => r.alternativaEstudante)).toEqual(['C']);
  });

  it('⚠️ minúscula também é descartada: o enum é A–E maiúsculo', async () => {
    const { svc, historicoRepository } = setup();

    await svc.processar({
      imageKey: 'k',
      respostas: [
        { questao: '1', alternativaEstudante: 'a' },
        { questao: '2', alternativaEstudante: 'B' },
      ],
    });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalledWith(
      'h1',
      [{ questao: 'idq2', alternativaEstudante: 'B' }],
    );
  });
});

describe('guarda por tentativaId (card 14)', () => {
  const RESPOSTAS = [{ questao: '1', alternativaEstudante: 'A' }];

  // historico com o token corrente `token`; `over` deixa cada teste acrescentar
  // campos (status/falha) sem repetir o dublê inteiro.
  const comToken = (token?: string | undefined, over: any = {}) =>
    setup({
      historicoRepository: {
        findByImageKey: jest.fn().mockResolvedValue({
          _id: 'h1',
          simulado: { _id: 's1' },
          ...(token !== undefined ? { tentativaId: token } : {}),
          ...over,
        }),
      },
    });

  it('token que bate: aplica normalmente', async () => {
    const { svc, historicoRepository, queueProducer } = comToken('T1');

    await svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      respostas: RESPOSTAS,
    });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalledWith(
      'h1',
      [{ questao: 'idq1', alternativaEstudante: 'A' }],
    );
    expect(queueProducer.publish).toHaveBeenCalled();
  });

  it('⚠️ token que NAO bate: descarta e nao escreve NADA', async () => {
    // reentrega do arq da tentativa 1 depois do reprocesso ter cunhado T2
    const { svc, historicoRepository, queueProducer } = comToken('T2');

    await svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      falha: { motivo: 'cartao_nao_detectado' },
    });

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
    expect(
      historicoRepository.prepararParaProcessamento,
    ).not.toHaveBeenCalled();
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('⚠️ token que NAO bate tambem descarta um callback de SUCESSO', async () => {
    // a reentrega pode chegar com respostas, e gravá-las sobrescreveria a
    // leitura da tentativa corrente
    const { svc, historicoRepository, queueProducer } = comToken('T2');

    await svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      respostas: RESPOSTAS,
    });

    expect(
      historicoRepository.prepararParaProcessamento,
    ).not.toHaveBeenCalled();
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('⚠️ callback SEM token: aplica, com log', async () => {
    // ms-omr ainda velho, ou job enfileirado antes do deploy. Recusar aqui
    // prenderia TODO cartao do periodo em awaiting_omr.
    const { svc, historicoRepository, queueProducer } = comToken('T1');

    await svc.processar({ imageKey: 'k', respostas: RESPOSTAS });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalled();
    expect(queueProducer.publish).toHaveBeenCalled();
  });

  it('⚠️ callback com token NULL: aplica — e o que o ms-omr novo manda sem token', async () => {
    // O `callback.py` do ms-omr poe `"tentativaId": None` no payload quando o
    // job nao tem token (job serializado antes do deploy). Em JSON isso chega
    // como `null`, e `null !== undefined` — tratar null como "token presente"
    // descartaria justamente o callback que o card promete aceitar.
    const { svc, historicoRepository, queueProducer } = comToken('T1');

    await svc.processar({
      imageKey: 'k',
      tentativaId: null as any,
      respostas: RESPOSTAS,
    });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalled();
    expect(queueProducer.publish).toHaveBeenCalled();
  });

  it('⚠️ historico SEM token: aplica, com log', async () => {
    // documento criado antes deste card
    const { svc, historicoRepository, queueProducer } = comToken(undefined);

    await svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      respostas: RESPOSTAS,
    });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalled();
    expect(queueProducer.publish).toHaveBeenCalled();
  });

  it('⚠️ O CENARIO DO CARD, ponta a ponta', async () => {
    // 1. tentativa 1 falha: o callback T1 marca failed
    const primeira = comToken('T1');
    await primeira.svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      falha: { motivo: 'cartao_nao_detectado', detalhe: 'sem markers' },
    });
    expect(primeira.historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'cartao_nao_detectado',
      'sem markers',
    );

    // 2. o coordenador reprocessa: o historico volta a awaiting_omr com T2 e a
    //    MESMA imageKey (a foto nao mudou — e' por isso que a chave nao
    //    distingue as tentativas)
    const depois = comToken('T2', { status: 'awaiting_omr' });

    // 3. o arq reentrega a tentativa 1 e o callback VELHO chega
    await depois.svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      falha: { motivo: 'cartao_nao_detectado', detalhe: 'sem markers' },
    });

    // → o historico NAO pode voltar a failed com o motivo velho
    expect(depois.historicoRepository.marcarFalha).not.toHaveBeenCalled();
    expect(
      depois.historicoRepository.prepararParaProcessamento,
    ).not.toHaveBeenCalled();
    expect(depois.queueProducer.publish).not.toHaveBeenCalled();
  });

  it('⚠️ O CENARIO DO CARD 13: a rede de seguranca sobrevive', async () => {
    // A varredura do card 13 marca `failed`/`leitura_nao_retornou` SEM acionar
    // o OMR — logo NAO troca o tentativaId, que continua T1. O callback
    // legitimo de T1 chega depois (o ms-omr so demorou mais que a janela de 1h)
    // e precisa ser APLICADO, desfazendo o falso positivo.
    //
    // ⚠️ E' por isso que a guarda e' por TOKEN e nao por STATUS: uma guarda de
    // status recusaria exatamente este callback ("ja esta failed, ignore") e o
    // cartao ficaria errado para sempre.
    const { svc, historicoRepository, queueProducer } = comToken('T1', {
      status: 'failed',
      falha: { motivo: 'leitura_nao_retornou' },
    });

    await svc.processar({
      imageKey: 'k',
      tentativaId: 'T1',
      respostas: RESPOSTAS,
    });

    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalledWith(
      'h1',
      [{ questao: 'idq1', alternativaEstudante: 'A' }],
    );
    expect(queueProducer.publish).toHaveBeenCalled();
  });
});
