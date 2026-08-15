import { StreamableFile } from '@nestjs/common';
import { CartaoRespostaController } from './cartao-resposta.controller';

describe('CartaoRespostaController', () => {
  it('GET :simuladoId → StreamableFile com o pdf', async () => {
    const provision = {
      obterPdf: jest.fn().mockResolvedValue(Buffer.from('PDF')),
    };
    const cartaoHistorico = { criar: jest.fn() };
    const controller = new CartaoRespostaController(
      provision as any,
      cartaoHistorico as any,
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
    const controller = new CartaoRespostaController(
      provision as any,
      cartaoHistorico as any,
    );
    const r = await controller.criarHistorico({
      usuario: 'u1',
      imageKey: 'cartoes/665/i.jpg',
      cartaoCode: '7',
    });
    expect(r).toEqual({ historicoId: 'h1' });
    expect(cartaoHistorico.criar).toHaveBeenCalled();
  });
});
