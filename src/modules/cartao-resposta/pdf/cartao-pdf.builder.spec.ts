import { buildLayout } from '../layout/cartao-layout';
import { buildCartaoPdf } from './cartao-pdf.builder';

describe('buildCartaoPdf', () => {
  it('gera um Buffer PDF não-vazio começando com %PDF', async () => {
    const buf = await buildCartaoPdf(buildLayout(90), {
      nomeSimulado: 'Simulado X',
      nomeProva: 'ENEM 2025',
      nomeCursinho: 'Cursinho Y',
      qrPayload: {
        simuladoId: 'spike',
        cursinhoId: 'spike',
        templateVersion: 'v1',
      },
    });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
