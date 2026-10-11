import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  TEXTO_SIMULADOS_INCOMPLETOS,
  TEXTO_SO_ENEM_DO_CURSINHO,
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
    bloqueado: false,
    categoria: { quantidadeTotalQuestao: 90 },
    questoes: Array.from({ length: 90 }, (_, i) => ({ numero: i + 1 })),
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
  const provas = {
    buscarProvaDoSimulado: jest
      .fn()
      .mockResolvedValue(over.prova === undefined ? null : over.prova),
    getById: jest.fn().mockResolvedValue(over.provaCompleta ?? null),
    incrementarCartaoSeq: jest.fn().mockResolvedValue(4),
  };
  const svc = new TemplateProvisionService(
    simuladoService as any,
    cartaoService as any,
    storage as any,
    provas as any,
  );
  return { svc, simuladoService, cartaoService, storage, provas };
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
        }),
      }),
      undefined,
      1,
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

  it('simulado bloqueado (não pronto) → Conflict, sem gerar nem incrementar', async () => {
    const { svc, simuladoService, cartaoService } = setup({
      simulado: {
        _id: ID,
        nome: 'x',
        bloqueado: true,
        questoes: [{ numero: 1 }],
      },
    });
    await expect(svc.obterPdf(ID)).rejects.toBeInstanceOf(ConflictException);
    expect(simuladoService.incrementarCartaoSeq).not.toHaveBeenCalled();
    expect(cartaoService.gerar).not.toHaveBeenCalled();
  });

  it('usa o menor numero das questões como startNumero (bloco 46..90 → N=45, start=46)', async () => {
    const { svc, cartaoService } = setup({
      simulado: {
        _id: ID,
        nome: 'CH Dia 1',
        bloqueado: false,
        questoes: Array.from({ length: 45 }, (_, i) => ({ numero: 46 + i })),
      },
    });
    await svc.obterPdf(ID);
    expect(cartaoService.gerar).toHaveBeenCalledWith(
      45,
      expect.anything(),
      undefined,
      46,
    );
  });

  describe('QR com a prova (tickets/038 · 06)', () => {
    const qr = (cartaoService: any) =>
      cartaoService.gerar.mock.calls[0][1].qrPayload;

    it('simulado numa prova: QR com provaId + simuladoId + cartaoCode', async () => {
      const PROVA = '665f0c1a2b3c4d5e6f00ffff';
      const { svc, cartaoService } = setup({ prova: { _id: PROVA } });
      await svc.obterPdf(ID);
      expect(qr(cartaoService)).toEqual({
        provaId: PROVA,
        simuladoId: ID,
        cartaoCode: '7',
      });
    });

    it('simulado sem prova: QR como hoje, sem provaId', async () => {
      const { svc, cartaoService } = setup();
      await svc.obterPdf(ID);
      expect(qr(cartaoService)).toEqual({ simuladoId: ID, cartaoCode: '7' });
    });
  });

  describe('cartão DA PROVA (tickets/038 · 08)', () => {
    const PROVA = '665f0c1a2b3c4d5e6f00ffff';
    const faixa = (de: number, ate: number) =>
      Array.from({ length: ate - de + 1 }, (_, i) => ({ numero: de + i }));
    const sim = (
      idioma: string | null,
      bloqueado = false,
      questoes = faixa(1, 90),
    ) => ({
      idioma,
      bloqueado,
      questoes,
    });
    const provaDia1 = (o: object = {}) => ({
      _id: PROVA,
      nome: '1º ENEM Dia 1',
      categoria: { dono: 'Cursinho' },
      simulados: [sim('Inglês'), sim('Espanhol')],
      ...o,
    });

    it('Dia 1: 90 questões a partir do 1, com idioma; QR só com a prova e o contador DA PROVA', async () => {
      const { svc, cartaoService, provas, simuladoService, storage } = setup({
        provaCompleta: provaDia1(),
      });
      const pdf = await svc.obterPdfDaProva(PROVA);

      expect(pdf.toString()).toBe('PDF');
      expect(provas.incrementarCartaoSeq).toHaveBeenCalledWith(PROVA);
      expect(simuladoService.incrementarCartaoSeq).not.toHaveBeenCalled();
      expect(cartaoService.gerar).toHaveBeenCalledWith(
        90,
        expect.objectContaining({
          nomeSimulado: '1º ENEM Dia 1',
          qrPayload: { provaId: PROVA, cartaoCode: '4' },
        }),
        undefined,
        1,
        { idioma: true },
      );
      expect(storage.putObject).toHaveBeenCalledWith(
        keyTemplate(PROVA),
        expect.any(String),
        'application/json',
      );
    });

    it('Dia 2: 91–180, sem idioma', async () => {
      const { svc, cartaoService } = setup({
        provaCompleta: provaDia1({
          simulados: [sim(null, false, faixa(91, 180))],
        }),
      });
      await svc.obterPdfDaProva(PROVA);
      const [n, , , inicio, opcoes] = cartaoService.gerar.mock.calls[0];
      expect([n, inicio, opcoes]).toEqual([90, 91, { idioma: false }]);
    });

    it('simulado incompleto → 409 com o motivo, sem gastar número', async () => {
      const { svc, provas, cartaoService } = setup({
        provaCompleta: provaDia1({
          simulados: [sim('Inglês'), sim('Espanhol', true)],
        }),
      });
      await expect(svc.obterPdfDaProva(PROVA)).rejects.toThrow(
        TEXTO_SIMULADOS_INCOMPLETOS,
      );
      expect(provas.incrementarCartaoSeq).not.toHaveBeenCalled();
      expect(cartaoService.gerar).not.toHaveBeenCalled();
    });

    it('prova que não é Enem do cursinho → 400; inexistente → 404', async () => {
      const outra = setup({
        provaCompleta: provaDia1({ categoria: { dono: 'cur-1' } }),
      });
      await expect(outra.svc.obterPdfDaProva(PROVA)).rejects.toThrow(
        TEXTO_SO_ENEM_DO_CURSINHO,
      );
      const sumiu = setup();
      await expect(sumiu.svc.obterPdfDaProva(PROVA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
