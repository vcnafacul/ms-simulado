import * as fs from 'fs';
import { CartaoRespostaService } from './cartao-resposta.service';

describe('CartaoRespostaService', () => {
  it('gera artefatos (template, config, marker existente, pdf)', async () => {
    const service = new CartaoRespostaService();
    const art = await service.gerar(90, {
      nomeSimulado: 'S',
      simuladoId: 'x',
      nomeProva: 'P',
      nomeCursinho: 'C',
      qrPayload: { simuladoId: 'x', cursinhoId: 'y', templateVersion: 'v1' },
    });
    expect(Object.keys(art.templateJson.fieldBlocks)).toContain('matricula');
    expect(art.configJson.outputs.show_image_level).toBe(0);
    expect(fs.existsSync(art.markerPngPath)).toBe(true);
    expect(art.pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
