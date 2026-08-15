import { StreamableFile } from '@nestjs/common';
import { CartaoRespostaController } from './cartao-resposta.controller';

describe('CartaoRespostaController', () => {
  it('GET :simuladoId → StreamableFile com o pdf', async () => {
    const provision = {
      obterPdf: jest.fn().mockResolvedValue(Buffer.from('PDF')),
    };
    const controller = new CartaoRespostaController(provision as any);
    const res = await controller.getCartao('665f0c1a2b3c4d5e6f000001');
    expect(res).toBeInstanceOf(StreamableFile);
    expect(provision.obterPdf).toHaveBeenCalledWith('665f0c1a2b3c4d5e6f000001');
  });
});
