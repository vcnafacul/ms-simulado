import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CartaoReprocessoService } from './cartao-reprocesso.service';

const SIM = '665f0c1a2b3c4d5e6f00abc2';
const AGORA = new Date('2026-09-20T10:00:00Z');

const montar = (over: any = {}) => {
  const historicoRepository = {
    // ⚠️ `getByFilter` (da BaseRepository), NÃO o `getById` do
    // `HistoricoRepository`: aquele faz `populate` de `simulado` (e de
    // `questoes.questao` dentro dele), e `String(simuladoPopulado)` devolve o
    // dump do documento, não o id — a conferência de QR abaixo nunca casaria.
    getByFilter: jest.fn().mockResolvedValue(
      over.historico === undefined
        ? {
            _id: 'h1',
            status: 'failed',
            cartaoCode: '7',
            simulado: SIM,
            imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc2/velha.jpg',
            ultimaTentativaEm: undefined,
          }
        : over.historico,
    ),
    reabrirParaOmr: jest.fn(),
    marcarFalha: jest.fn(),
  };
  const relatorioRepository = {
    buscarPorHistorico: jest
      .fn()
      .mockResolvedValue(
        over.linha === undefined ? { usuario: 'u1' } : over.linha,
      ),
  };
  const omrHttp = { enviarProcessamento: over.enviar ?? jest.fn() };
  const svc = new CartaoReprocessoService(
    historicoRepository as any,
    relatorioRepository as any,
    omrHttp as any,
  );
  return { svc, historicoRepository, relatorioRepository, omrHttp };
};

const pedido = (over: any = {}) => ({
  historicoId: 'h1',
  cursinhoId: 'cur-1',
  simuladoId: SIM,
  cartaoCode: '7',
  imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
  agora: AGORA,
  ...over,
});

describe('CartaoReprocessoService', () => {
  it('reabre o histórico e aciona o OMR', async () => {
    const { svc, historicoRepository, omrHttp } = montar();

    await svc.reprocessar(pedido());

    expect(historicoRepository.reabrirParaOmr).toHaveBeenCalledWith('h1', {
      imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
      quando: AGORA,
      tentativaId: expect.any(String),
    });
    expect(omrHttp.enviarProcessamento).toHaveBeenCalledWith(
      'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
      expect.any(String),
    );
  });

  it('⚠️ o gate é consultado com o cursinho que chegou, não com outro', async () => {
    const { svc, relatorioRepository } = montar();

    await svc.reprocessar(pedido());

    expect(relatorioRepository.buscarPorHistorico).toHaveBeenCalledWith(
      'h1',
      'cur-1',
    );
  });

  it('⚠️ histórico de outro cursinho dá 404, e nada é escrito', async () => {
    const { svc, historicoRepository } = montar({ linha: null });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(NotFoundException);
    expect(historicoRepository.reabrirParaOmr).not.toHaveBeenCalled();
  });

  it('histórico inexistente dá 404', async () => {
    const { svc, historicoRepository } = montar({ historico: null });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(NotFoundException);
    expect(historicoRepository.reabrirParaOmr).not.toHaveBeenCalled();
  });

  it('⚠️ status que não é failed dá 409', async () => {
    // reprocessar um cartão que está lendo abriria corrida com o callback em voo
    const { svc } = montar({
      historico: {
        _id: 'h1',
        status: 'completed',
        cartaoCode: '7',
        simulado: SIM,
      },
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(ConflictException);
  });

  it('⚠️ awaiting_omr também dá 409 — a leitura está em voo', async () => {
    const { svc, historicoRepository } = montar({
      historico: {
        _id: 'h1',
        status: 'awaiting_omr',
        cartaoCode: '7',
        simulado: SIM,
      },
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(ConflictException);
    expect(historicoRepository.reabrirParaOmr).not.toHaveBeenCalled();
  });

  it('⚠️ QR de OUTRO cartão é recusado — senão a folha errada entra neste histórico', async () => {
    const { svc, historicoRepository } = montar();

    await expect(svc.reprocessar(pedido({ cartaoCode: '99' }))).rejects.toThrow(
      BadRequestException,
    );
    expect(historicoRepository.reabrirParaOmr).not.toHaveBeenCalled();
  });

  it('⚠️ QR de outro SIMULADO também é recusado', async () => {
    const { svc } = montar();

    await expect(
      svc.reprocessar(pedido({ simuladoId: '665f0c1a2b3c4d5e6f00abcf' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('sem foto nova, não confere QR nenhum e mantém a chave', async () => {
    // é o caminho do `reprocessar`: a foto não mudou
    const { svc, historicoRepository, omrHttp } = montar();

    await svc.reprocessar({
      historicoId: 'h1',
      cursinhoId: 'cur-1',
      agora: AGORA,
    } as any);

    expect(historicoRepository.reabrirParaOmr).toHaveBeenCalledWith('h1', {
      quando: AGORA,
      tentativaId: expect.any(String),
    });
    // e o OMR é acionado com a chave que já estava lá
    expect(omrHttp.enviarProcessamento).toHaveBeenCalledWith(
      'cartoes/665f0c1a2b3c4d5e6f00abc2/velha.jpg',
      expect.any(String),
    );
  });

  it('⚠️ dentro da janela, recusa dizendo QUANTO falta', async () => {
    const { svc } = montar({
      historico: {
        _id: 'h1',
        status: 'failed',
        cartaoCode: '7',
        simulado: SIM,
        ultimaTentativaEm: new Date(AGORA.getTime() - 20_000),
      },
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(
      /40\s*s|0?0:40|40 segundo/i,
    );
  });

  it('passada a janela, libera', async () => {
    const { svc, historicoRepository } = montar({
      historico: {
        _id: 'h1',
        status: 'failed',
        cartaoCode: '7',
        simulado: SIM,
        ultimaTentativaEm: new Date(AGORA.getTime() - 61_000),
      },
    });

    await svc.reprocessar(pedido());

    expect(historicoRepository.reabrirParaOmr).toHaveBeenCalled();
  });

  it('⚠️ falha ao acionar o OMR devolve o histórico para failed', async () => {
    // senão ele fica em awaiting_omr para sempre, e some do relatório como
    // "processando" sem ninguém para consertar
    const { svc, historicoRepository } = montar({
      enviar: jest.fn().mockRejectedValue(new Error('omr fora')),
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow();
    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'omr_indisponivel',
      expect.any(String),
    );
  });
});

describe('tentativaId no reprocesso (card 14)', () => {
  it('⚠️ cunha um token NOVO e o grava ANTES de acionar o OMR', async () => {
    // A ordem importa: se o token fosse gravado depois do POST, um callback
    // rapido chegaria antes da escrita e seria descartado por nao bater com
    // nada.
    const { svc, historicoRepository, omrHttp } = montar();

    await svc.reprocessar(pedido());

    const tentativaId =
      historicoRepository.reabrirParaOmr.mock.calls[0][1].tentativaId;
    expect(typeof tentativaId).toBe('string');
    expect(tentativaId.length).toBeGreaterThan(0);

    expect(omrHttp.enviarProcessamento).toHaveBeenCalledWith(
      'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
      tentativaId,
    );

    expect(
      historicoRepository.reabrirParaOmr.mock.invocationCallOrder[0],
    ).toBeLessThan(omrHttp.enviarProcessamento.mock.invocationCallOrder[0]);
  });

  it('⚠️ dois reprocessos produzem tokens DIFERENTES', async () => {
    // ESTE e' o caso do card: a `imageKey` e' reusada de proposito no
    // `reprocessar`, entao so o token distingue a tentativa 2 da tentativa 1.
    const a = montar();
    await a.svc.reprocessar(pedido());
    const b = montar();
    await b.svc.reprocessar(pedido());

    expect(
      a.historicoRepository.reabrirParaOmr.mock.calls[0][1].tentativaId,
    ).not.toBe(
      b.historicoRepository.reabrirParaOmr.mock.calls[0][1].tentativaId,
    );
  });
});
