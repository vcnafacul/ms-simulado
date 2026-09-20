import {
  INestApplication,
  StreamableFile,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CartaoCallbackService } from './cartao-callback.service';
import { CartaoHistoricoService } from './cartao-historico.service';
import { CartaoReprocessoService } from './cartao-reprocesso.service';
import { CartaoRespostaController } from './cartao-resposta.controller';
import { TemplateProvisionService } from './template-provision.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

describe('CartaoRespostaController', () => {
  it('GET :simuladoId → StreamableFile com o pdf', async () => {
    const provision = {
      obterPdf: jest.fn().mockResolvedValue(Buffer.from('PDF')),
    };
    const cartaoHistorico = { criar: jest.fn() };
    const cartaoCallback = { processar: jest.fn() };
    const controller = new CartaoRespostaController(
      provision as any,
      cartaoHistorico as any,
      cartaoCallback as any,
      { reprocessar: jest.fn() } as any,
    );
    const res = await controller.getCartao('665f0c1a2b3c4d5e6f000001');
    expect(res).toBeInstanceOf(StreamableFile);
    expect(provision.obterPdf).toHaveBeenCalledWith('665f0c1a2b3c4d5e6f000001');
  });

  it('POST historico delega ao CartaoHistoricoService', async () => {
    const provision = { obterPdf: jest.fn() };
    const cartaoHistorico = {
      criar: jest.fn().mockResolvedValue({ historicoId: 'h1' }),
    };
    const cartaoCallback = { processar: jest.fn() };
    const controller = new CartaoRespostaController(
      provision as any,
      cartaoHistorico as any,
      cartaoCallback as any,
      { reprocessar: jest.fn() } as any,
    );
    const r = await controller.criarHistorico({
      usuario: 'u1',
      imageKey: 'cartoes/665/i.jpg',
      cartaoCode: '7',
    });
    expect(r).toEqual({ historicoId: 'h1' });
    expect(cartaoHistorico.criar).toHaveBeenCalled();
  });

  it('POST callback delega ao CartaoCallbackService e responde ok', async () => {
    const provision = { obterPdf: jest.fn() };
    const cartaoHistorico = { criar: jest.fn() };
    const cartaoCallback = {
      processar: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new CartaoRespostaController(
      provision as any,
      cartaoHistorico as any,
      cartaoCallback as any,
      { reprocessar: jest.fn() } as any,
    );
    const r = await controller.callback({ imageKey: 'k', respostas: [] });
    expect(cartaoCallback.processar).toHaveBeenCalledWith({
      imageKey: 'k',
      respostas: [],
    });
    expect(r).toEqual({ status: 'ok' });
  });

  it('reprocessar repassa o histórico, o cursinho e o QR ao serviço', async () => {
    const service = { reprocessar: jest.fn() };
    const ctrl = new CartaoRespostaController(
      {} as any,
      {} as any,
      {} as any,
      service as any,
    );

    await ctrl.reprocessar('h1', {
      cursinhoId: 'cur-1',
      imageKey: 'cartoes/abc/nova.jpg',
      simuladoId: 'abc',
      cartaoCode: '7',
    } as any);

    expect(service.reprocessar).toHaveBeenCalledWith(
      expect.objectContaining({
        historicoId: 'h1',
        cursinhoId: 'cur-1',
        imageKey: 'cartoes/abc/nova.jpg',
        cartaoCode: '7',
        agora: expect.any(Date),
      }),
    );
  });
});

/**
 * ⚠️ O spec acima chama o método do controller direto — nenhuma asserção dali
 * prova que a rota EXISTE no caminho certo, nem que o `cursinhoId` é
 * obrigatório no corpo. Rota literal colidindo com `:param` é justamente a
 * classe de defeito que teste de unidade não pega: a `@Get(\':simuladoId\')`
 * deste mesmo controller já ocupa um segmento. Este bloco sobe o app (sem
 * Mongo: os quatro serviços são dublês) e fala HTTP de verdade.
 */
describe('CartaoRespostaController — roteamento HTTP', () => {
  let app: INestApplication;
  const cartaoReprocesso = { reprocessar: jest.fn() };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [CartaoRespostaController],
      providers: [
        {
          provide: TemplateProvisionService,
          useValue: { obterPdf: jest.fn() },
        },
        { provide: CartaoHistoricoService, useValue: { criar: jest.fn() } },
        { provide: CartaoCallbackService, useValue: { processar: jest.fn() } },
        { provide: CartaoReprocessoService, useValue: cartaoReprocesso },
      ],
    }).compile();

    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('POST :historicoId/reprocessar responde 202 e chega ao serviço', async () => {
    await request(app.getHttpServer())
      .post('/v1/cartao-resposta/h1/reprocessar')
      .send({ cursinhoId: 'cur-1' })
      .expect(202);

    expect(cartaoReprocesso.reprocessar).toHaveBeenCalledWith(
      expect.objectContaining({ historicoId: 'h1', cursinhoId: 'cur-1' }),
    );
  });

  it('⚠️ sem cursinhoId no corpo é 400 — o gate não tem valor padrão', async () => {
    await request(app.getHttpServer())
      .post('/v1/cartao-resposta/h1/reprocessar')
      .send({})
      .expect(400);

    expect(cartaoReprocesso.reprocessar).not.toHaveBeenCalled();
  });
});
