import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { CartaoHistoricoService } from './cartao-historico.service';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';

function setup(over: any = {}) {
  const repo = {
    buscarCartaoEnviado: jest.fn().mockResolvedValue(null),
    createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
    ...over.repo,
  };
  const omr = {
    enviarProcessamento: jest.fn().mockResolvedValue(undefined),
    ...over.omr,
  };
  return {
    svc: new CartaoHistoricoService(
      repo as any,
      omr as any,
      { registrar: jest.fn() } as any,
    ),
    repo,
    omr,
  };
}
const DTO = {
  usuario: 'u1',
  imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
  cartaoCode: '7',
};

it('happy: cria e chama o omr', async () => {
  const { svc, repo, omr } = setup();
  const r = await svc.criar(DTO);
  expect(r).toEqual({ historicoId: 'h1' });
  expect(repo.createAwaitingOmr).toHaveBeenCalledWith(
    expect.objectContaining({ simuladoId: '665f0c1a2b3c4d5e6f00abc1' }),
  );
  expect(omr.enviarProcessamento).toHaveBeenCalledWith(
    DTO.imageKey,
    expect.any(String),
  );
});

it('dedup: 409 e não cria', async () => {
  const { svc, repo } = setup({
    repo: {
      buscarCartaoEnviado: jest
        .fn()
        .mockResolvedValue({ status: HistoricoStatus.Completed }),
    },
  });
  await expect(svc.criar(DTO)).rejects.toThrow(
    new ConflictException('Este cartão já foi enviado para este estudante.'),
  );
  expect(repo.createAwaitingOmr).not.toHaveBeenCalled();
});

it('⚠️ dedup vale também para o cartão FALHO — e manda usar o Reenviar', async () => {
  const { svc, repo, omr } = setup({
    repo: {
      buscarCartaoEnviado: jest
        .fn()
        .mockResolvedValue({ status: HistoricoStatus.Failed }),
    },
  });
  await expect(svc.criar(DTO)).rejects.toThrow(/Use "Reenviar" no relatório/);
  expect(repo.createAwaitingOmr).not.toHaveBeenCalled();
  expect(omr.enviarProcessamento).not.toHaveBeenCalled();
});

it('⚠️ a corrida que passa pela consulta: o índice único vira o mesmo 409', async () => {
  const { svc, omr } = setup({
    repo: {
      createAwaitingOmr: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 })),
    },
  });
  await expect(svc.criar(DTO)).rejects.toBeInstanceOf(ConflictException);
  expect(omr.enviarProcessamento).not.toHaveBeenCalled();
});

it('omr falha: marca Failed e 502', async () => {
  const { svc, repo } = setup({
    omr: {
      enviarProcessamento: jest.fn().mockRejectedValue(new Error('down')),
    },
  });
  await expect(svc.criar(DTO)).rejects.toBeInstanceOf(BadGatewayException);
  expect(repo.marcarFalha).toHaveBeenCalledWith(
    'h1',
    'omr_indisponivel',
    'down',
  );
});

it('imageKey inválido: 400 sem criar', async () => {
  const { svc, repo } = setup();
  await expect(svc.criar({ ...DTO, imageKey: 'invalido' })).rejects.toThrow();
  expect(repo.createAwaitingOmr).not.toHaveBeenCalled();
});

it('cria a linha de junção com o vínculo recebido', async () => {
  const historicoRepository = {
    buscarCartaoEnviado: jest.fn().mockResolvedValue(null),
    createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
  };
  const omrHttp = {
    enviarProcessamento: jest.fn().mockResolvedValue(undefined),
  };
  const relatorio = { registrar: jest.fn().mockResolvedValue(undefined) };
  const svc = new CartaoHistoricoService(
    historicoRepository as any,
    omrHttp as any,
    relatorio as any,
  );

  await svc.criar({
    usuario: 'u1',
    imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
    cartaoCode: '7',
    cursinhoId: 'cur-1',
    turmaId: 't-1',
  });

  expect(relatorio.registrar).toHaveBeenCalledWith({
    historicoId: 'h1',
    simuladoId: '665f0c1a2b3c4d5e6f00abc1',
    usuario: 'u1',
    cursinhoId: 'cur-1',
    turmaId: 't-1',
  });
});

it('sem cursinhoId não cria linha, e avisa no log', async () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const historicoRepository = {
    buscarCartaoEnviado: jest.fn().mockResolvedValue(null),
    createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
  };
  const omrHttp = {
    enviarProcessamento: jest.fn().mockResolvedValue(undefined),
  };
  const relatorio = { registrar: jest.fn() };
  const svc = new CartaoHistoricoService(
    historicoRepository as any,
    omrHttp as any,
    relatorio as any,
  );

  await svc.criar({
    usuario: 'u1',
    imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
    cartaoCode: '7',
  });

  expect(relatorio.registrar).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('h1'));
  warn.mockRestore();
});

it('falha ao criar a linha NÃO derruba o upload, mas vai para o log com o historicoId', async () => {
  const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  const historicoRepository = {
    buscarCartaoEnviado: jest.fn().mockResolvedValue(null),
    createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
  };
  const omrHttp = {
    enviarProcessamento: jest.fn().mockResolvedValue(undefined),
  };
  const relatorio = {
    registrar: jest.fn().mockRejectedValue(new Error('mongo caiu')),
  };
  const svc = new CartaoHistoricoService(
    historicoRepository as any,
    omrHttp as any,
    relatorio as any,
  );

  // o cartão é lido normalmente; só fica fora do relatório até alguém reconciliar
  const r = await svc.criar({
    usuario: 'u1',
    imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
    cartaoCode: '7',
    cursinhoId: 'cur-1',
  });

  expect(r).toEqual({ historicoId: 'h1' });
  expect(omrHttp.enviarProcessamento).toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(expect.stringContaining('h1'));
  error.mockRestore();
});

describe('tentativaId (card 14)', () => {
  it('⚠️ cunha um token NOVO e o grava ANTES de acionar o OMR', async () => {
    // A ordem importa: se o token fosse gravado depois do POST, um callback
    // rapido chegaria antes da escrita e seria descartado por nao bater com
    // nada.
    const { svc, repo, omr } = setup();

    await svc.criar(DTO);

    const tentativaId = repo.createAwaitingOmr.mock.calls[0][0].tentativaId;
    expect(typeof tentativaId).toBe('string');
    expect(tentativaId.length).toBeGreaterThan(0);

    // o MESMO token que foi gravado e' o que viaja ao ms-omr
    expect(omr.enviarProcessamento).toHaveBeenCalledWith(
      DTO.imageKey,
      tentativaId,
    );

    // e a escrita aconteceu ANTES do POST
    expect(repo.createAwaitingOmr.mock.invocationCallOrder[0]).toBeLessThan(
      omr.enviarProcessamento.mock.invocationCallOrder[0],
    );
  });

  it('⚠️ dois acionamentos produzem tokens DIFERENTES', async () => {
    // um token fixo nao distingue tentativa nenhuma — a guarda do callback
    // voltaria a aceitar a reentrega velha.
    const a = setup();
    await a.svc.criar(DTO);
    const b = setup();
    await b.svc.criar(DTO);

    expect(a.repo.createAwaitingOmr.mock.calls[0][0].tentativaId).not.toBe(
      b.repo.createAwaitingOmr.mock.calls[0][0].tentativaId,
    );
  });
});
