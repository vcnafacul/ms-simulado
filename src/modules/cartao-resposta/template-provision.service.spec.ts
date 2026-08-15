import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  TemplateProvisionService,
  keyTemplate,
  keyConfig,
} from './template-provision.service';

const ID = '665f0c1a2b3c4d5e6f000001';

function setup(over: Partial<any> = {}) {
  const simulado = over.simulado ?? {
    _id: ID,
    nome: 'Simulado ENEM',
    cursinhoId: null,
    categoria: { quantidadeTotalQuestao: 90 },
  };
  const simuladoService = {
    getById: jest.fn().mockResolvedValue(simulado),
    incrementarCartaoSeq: jest.fn().mockResolvedValue(7),
  };
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
  it('json ausente: incrementa contador, gera on-the-fly com cartaoCode, grava só os JSONs e devolve o pdf', async () => {
    const { svc, simuladoService, cartaoService, storage } = setup();
    const pdf = await svc.obterPdf(ID);

    expect(pdf.toString()).toBe('PDF');
    expect(simuladoService.incrementarCartaoSeq).toHaveBeenCalledWith(ID);
    expect(cartaoService.gerar).toHaveBeenCalledWith(
      90,
      expect.objectContaining({
        nomeSimulado: 'Simulado ENEM',
        simuladoId: ID,
        qrPayload: expect.objectContaining({
          simuladoId: ID,
          cartaoCode: '7',
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
    // nunca grava o PDF no R2
    const pdfPuts = storage.putObject.mock.calls.filter(
      (c: any[]) => c[2] === 'application/pdf',
    );
    expect(pdfPuts).toHaveLength(0);
  });

  it('json já existe: ainda incrementa + gera + devolve o pdf, mas não grava nada', async () => {
    const { svc, simuladoService, cartaoService, storage } = setup({
      storage: { exists: jest.fn().mockResolvedValue(true) },
    });
    const pdf = await svc.obterPdf(ID);

    expect(pdf.toString()).toBe('PDF');
    expect(simuladoService.incrementarCartaoSeq).toHaveBeenCalledWith(ID);
    expect(cartaoService.gerar).toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
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
