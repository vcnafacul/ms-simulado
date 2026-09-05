import { buildLayout, DEFAULT_CONFIG } from '../layout/cartao-layout';
import { buildCartaoPdf } from './cartao-pdf.builder';

describe('buildCartaoPdf', () => {
  it('gera um Buffer PDF não-vazio começando com %PDF', async () => {
    const buf = await buildCartaoPdf(buildLayout(90), {
      nomeSimulado: 'Simulado X',
      simuladoId: '665f0c1a2b3c4d5e6f000001',
      nomeProva: 'ENEM 2025',
      nomeCursinho: 'Cursinho Y',
      qrPayload: {
        simuladoId: 'spike',
        cartaoCode: '7',
      },
    });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('gera PDF com header self-contained (só nomeSimulado + simuladoId)', async () => {
    const layout = buildLayout(90, DEFAULT_CONFIG);
    const buf = await buildCartaoPdf(layout, {
      nomeSimulado: 'Simulado ENEM',
      simuladoId: '665f0c1a2b3c4d5e6f000001',
      qrPayload: {
        simuladoId: '665f0c1a2b3c4d5e6f000001',
        cartaoCode: '7',
      },
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
