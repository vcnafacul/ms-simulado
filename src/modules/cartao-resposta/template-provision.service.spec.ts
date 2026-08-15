import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  TemplateProvisionService,
  keyTemplate,
  keyConfig,
  keyPdf,
} from './template-provision.service';

const ID = '665f0c1a2b3c4d5e6f000001';

function setup(over: Partial<any> = {}) {
  const simulado = over.simulado ?? {
    _id: ID,
    nome: 'Simulado ENEM',
    cursinhoId: null,
    categoria: { quantidadeTotalQuestao: 90 },
  };
  const simuladoService = { getById: jest.fn().mockResolvedValue(simulado) };
  const cartaoService = {
    gerar: jest.fn().mockResolvedValue({
      templateJson: { a: 1 },
      configJson: { b: 2 },
      pdfBuffer: Buffer.from('PDF'),
    }),
  };
  const storage = {
    exists: jest.fn().mockResolvedValue(false),
    get: jest.fn().mockResolvedValue(Buffer.from('CACHED')),
    putObject: jest.fn().mockResolvedValue(undefined),
    ...over.storage,
  };
  const svc = new TemplateProvisionService(
    simuladoService as any,
    cartaoService as any,
    storage as any,
  );
  return { svc, simuladoService, cartaoService, storage };
}

describe('TemplateProvisionService', () => {
  it('miss: gera, grava 3 artefatos e devolve o pdf', async () => {
    const { svc, cartaoService, storage } = setup();
    const pdf = await svc.obterPdf(ID);
    expect(pdf.toString()).toBe('PDF');
    expect(cartaoService.gerar).toHaveBeenCalledWith(
      90,
      expect.objectContaining({
        nomeSimulado: 'Simulado ENEM',
        simuladoId: ID,
        qrPayload: expect.objectContaining({
          simuladoId: ID,
          templateVersion: 'v1',
        }),
      }),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      keyTemplate(ID),
      JSON.stringify({ a: 1 }),
      'application/json',
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      keyConfig(ID),
      JSON.stringify({ b: 2 }),
      'application/json',
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      keyPdf(ID),
      Buffer.from('PDF'),
      'application/pdf',
    );
  });

  it('hit: não regera, devolve o pdf do R2', async () => {
    const { svc, cartaoService, storage } = setup({
      storage: { exists: jest.fn().mockResolvedValue(true) },
    });
    const pdf = await svc.obterPdf(ID);
    expect(pdf.toString()).toBe('CACHED');
    expect(cartaoService.gerar).not.toHaveBeenCalled();
    expect(storage.get).toHaveBeenCalledWith(keyPdf(ID));
  });

  it('simulado inexistente → NotFound', async () => {
    const { svc, simuladoService } = setup();
    simuladoService.getById.mockResolvedValue(null);
    await expect(svc.obterPdf(ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('categoria sem quantidadeTotalQuestao → BadRequest', async () => {
    const { svc } = setup({
      simulado: {
        _id: ID,
        nome: 'x',
        cursinhoId: null,
        categoria: { quantidadeTotalQuestao: null },
      },
    });
    await expect(svc.obterPdf(ID)).rejects.toBeInstanceOf(BadRequestException);
  });
});
