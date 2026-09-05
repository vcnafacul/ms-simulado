import * as fs from 'fs';
import { CartaoRespostaService } from './cartao-resposta.service';
import { DEFAULT_CONFIG } from './layout/cartao-layout';

describe('CartaoRespostaService', () => {
  const header = {
    nomeSimulado: 'S',
    simuladoId: 'x',
    nomeProva: 'P',
    nomeCursinho: 'C',
    qrPayload: {
      simuladoId: 'x',
      cartaoCode: '1',
    },
  };

  it('gera artefatos (template, config, marker existente, pdf) — DEFAULT sem matrícula', async () => {
    const service = new CartaoRespostaService();
    const art = await service.gerar(90, header);
    expect(Object.keys(art.templateJson.fieldBlocks)).not.toContain(
      'matricula',
    );
    expect(art.configJson.outputs.show_image_level).toBe(0);
    expect(fs.existsSync(art.markerPngPath)).toBe(true);
    expect(art.pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('inclui matrícula no template quando incluirMatricula=true', async () => {
    const service = new CartaoRespostaService();
    const art = await service.gerar(90, header, {
      ...DEFAULT_CONFIG,
      incluirMatricula: true,
    });
    expect(Object.keys(art.templateJson.fieldBlocks)).toContain('matricula');
    expect(art.pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
