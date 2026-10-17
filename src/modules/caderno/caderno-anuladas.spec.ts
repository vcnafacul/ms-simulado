import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Status } from '../questao/enums/status.enum';
import { TemplateProvisionService } from '../cartao-resposta/template-provision.service';
import { CadernoController } from './caderno.controller';
import {
  CadernoService,
  exigirConfirmacaoDasAnuladas,
} from './caderno.service';
import { montarCadernoDaProva } from './gerador/caderno-da-prova';
import { gerarCaderno, TEXTO_DO_SELO } from './gerador/gerar-caderno';

/** tickets/042, card 05 — selo no caderno, confirmação antes, cartão intocado. */
const questao = (texto: string) => ({
  status: Status.Approved,
  textoQuestao: texto,
  pergunta: 'Qual?',
  textoAlternativaA: 'a',
  textoAlternativaB: 'b',
  textoAlternativaC: 'c',
  textoAlternativaD: 'd',
  textoAlternativaE: 'e',
});
const anulacao = { motivo: 'outro', justificativa: 'x' };
const simulado = (anulada45 = true) => ({
  nome: 'Simulado',
  categoria: { nome: 'Cat', duracao: 300, quantidadeTotalQuestao: 3 },
  questoes: [
    { questao: questao('Enunciado 44.'), numero: 44 },
    {
      questao: questao('Enunciado 45.'),
      numero: 45,
      ...(anulada45 ? { anulacao } : {}),
    },
    { questao: questao('Enunciado 46.'), numero: 46 },
  ],
});

describe('caderno com anulada (042/05) — gerador', () => {
  it('a anulada sai no MESMO número, com o selo antes do enunciado; só ela', () => {
    const c = gerarCaderno(simulado(), { draft: false });
    expect(c.questoesIncluidas).toEqual([44, 45, 46]);
    const bloco45 = c.conteudo
      .split('\\setcounter{question}{44}')[1]
      .split('\\setcounter')[0];
    expect(bloco45).toMatch(
      /\\question\n\\noindent\\fbox\{\\textbf\{QUESTÃO ANULADA: não responda\}\}\\par\nEnunciado 45\./,
    );
    expect(c.conteudo.split(TEXTO_DO_SELO)).toHaveLength(2);
    expect(c.avisos).toContain('questão 45 anulada: impressa com selo');
  });

  it('sem anulada: conteúdo idêntico ao de hoje', () => {
    const sem = gerarCaderno(simulado(false), { draft: false });
    expect(sem.conteudo).not.toContain(TEXTO_DO_SELO);
    const semCampo = gerarCaderno(
      {
        ...simulado(false),
        questoes: simulado(false).questoes.map(({ questao, numero }) => ({
          questao,
          numero,
        })),
      },
      { draft: false },
    );
    expect(sem.conteudo).toBe(semCampo.conteudo);
  });

  it('rascunho também mostra o selo', () => {
    const c = gerarCaderno(simulado(), { draft: true });
    expect(c.conteudo).toContain(TEXTO_DO_SELO);
  });

  it('caderno DA prova carrega a anulação campo a campo', () => {
    const s = simulado();
    const c = montarCadernoDaProva({ nome: 'P', categoria: s.categoria }, [
      s as never,
    ]);
    expect(c.questoes.find((q) => q.numero === 45)!.anulacao).toEqual(anulacao);
    expect(c.questoes.find((q) => q.numero === 44)!.anulacao).toBeUndefined();
  });
});

describe('caderno com anulada (042/05) — confirmação', () => {
  it('sem confirmação → 409 CADERNO_COM_ANULADAS com os números (todos os simulados)', () => {
    let erro: unknown;
    try {
      exigirConfirmacaoDasAnuladas([
        simulado(),
        {
          questoes: [
            { numero: 3, anulacao },
            { numero: 45, anulacao },
          ],
        },
      ]);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      code: 'CADERNO_COM_ANULADAS',
      numeros: [3, 45],
    });
  });

  it('com confirmação, ou sem anulada → passa', () => {
    expect(() =>
      exigirConfirmacaoDasAnuladas([simulado()], true),
    ).not.toThrow();
    expect(() => exigirConfirmacaoDasAnuladas([simulado(false)])).not.toThrow();
  });

  it('gerarZip: normal sem confirmação recusa; rascunho e confirmado seguem', async () => {
    const service = new CadernoService(
      {
        getById: jest
          .fn()
          .mockResolvedValue({ ...simulado(), bloqueado: false }),
      } as never,
      {} as never,
      { get: () => true } as never,
      {} as never,
      {} as never,
    );
    const empacotar = jest
      .spyOn(service as any, 'empacotar')
      .mockResolvedValue({ nome: 'z', buffer: Buffer.from(''), avisos: 0 });

    await expect(
      service.gerarZip('s', { draft: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(empacotar).not.toHaveBeenCalled();
    await service.gerarZip('s', { draft: true });
    await service.gerarZip('s', { draft: false, confirmarAnuladas: true });
    expect(empacotar).toHaveBeenCalledTimes(2);
  });
});

describe('caderno com anulada (042/05) — rotas', () => {
  let app: INestApplication;
  const ID = '507f1f77bcf86cd799439011';
  const servico = {
    gerarZip: jest.fn().mockResolvedValue({
      nome: 'z.zip',
      buffer: Buffer.from('x'),
      avisos: 0,
    }),
    gerarZipDaProva: jest.fn().mockResolvedValue({
      nome: 'z.zip',
      buffer: Buffer.from('x'),
      avisos: 0,
    }),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [CadernoController],
      providers: [{ provide: CadernoService, useValue: servico }],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['GET', `/v1/caderno/${ID}`, 'gerarZip'],
    ['POST', `/v1/caderno/${ID}`, 'gerarZip'],
    ['POST', `/v1/caderno/prova/${ID}`, 'gerarZipDaProva'],
  ] as const)(
    '%s %s repassa ?confirmarAnuladas=true (só a string exata)',
    async (metodo, url, fn) => {
      const srv = app.getHttpServer();
      const chamar = (q: string) =>
        metodo === 'GET'
          ? request(srv).get(url + q)
          : request(srv)
              .post(url + q)
              .send({});
      await chamar('?confirmarAnuladas=true').expect(
        metodo === 'GET' ? 200 : 201,
      );
      await chamar('?confirmarAnuladas=1');
      const [com, sem] = servico[fn].mock.calls.map((c: any[]) => c[1]);
      expect(com.confirmarAnuladas).toBe(true);
      expect(sem.confirmarAnuladas).toBeUndefined();
    },
  );
});

describe('caderno com anulada (042/05) — cartão-resposta não muda', () => {
  it('o cartão é gerado com os mesmos argumentos com ou sem anulada', async () => {
    const chamadas: unknown[][] = [];
    for (const anulada of [false, true]) {
      const cartao = {
        gerar: jest.fn().mockResolvedValue({
          templateJson: {},
          configJson: {},
          pdfBuffer: Buffer.from(''),
        }),
      };
      const service = new TemplateProvisionService(
        {
          getById: jest
            .fn()
            .mockResolvedValue({ ...simulado(anulada), bloqueado: false }),
          incrementarCartaoSeq: jest.fn().mockResolvedValue(7),
        } as never,
        cartao as never,
        { exists: jest.fn().mockResolvedValue(true) } as never,
        { buscarProvaDoSimulado: jest.fn().mockResolvedValue(null) } as never,
      );
      await service.obterPdf('s1');
      chamadas.push(cartao.gerar.mock.calls[0]);
    }
    expect(chamadas[1]).toEqual(chamadas[0]);
    expect(chamadas[0][0]).toBe(3);
  });
});
