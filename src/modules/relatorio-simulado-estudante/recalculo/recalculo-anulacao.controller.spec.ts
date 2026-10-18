import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { VALIDATION_PIPE_OPTIONS } from 'src/config/validation-pipe.config';
import { RelatorioProvaController } from '../relatorio-prova.controller';
import { RelatorioSimuladoEstudanteController } from '../relatorio-simulado-estudante.controller';
import { RelatorioSimuladoEstudanteService } from '../relatorio-simulado-estudante.service';
import { RecalculoAnulacaoController } from './recalculo-anulacao.controller';
import { RecalculoAnulacaoService } from './recalculo-anulacao.service';

/** tickets/042, card 12 — as rotas ao lado das do relatório (a colisão nasce no roteamento). */
describe('RecalculoAnulacaoController — rotas', () => {
  let app: INestApplication;
  const ID = '507f1f77bcf86cd799439011';
  const recalculo = {
    consultar: jest.fn().mockResolvedValue({ divergentes: 0 }),
    solicitar: jest.fn().mockResolvedValue({ criado: true }),
    recorteDaProva: jest.fn(async (provaId: string, cursinhoId: string) => ({
      simuladoIds: ['s1'],
      cursinhoId,
      provaId,
    })),
  };
  const relatorio = {
    consultar: jest.fn(),
    consultarQuestoes: jest.fn(),
    consultarProva: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [
        RelatorioSimuladoEstudanteController,
        RelatorioProvaController,
        RecalculoAnulacaoController,
      ],
      providers: [
        { provide: RecalculoAnulacaoService, useValue: recalculo },
        { provide: RelatorioSimuladoEstudanteService, useValue: relatorio },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST/GET do simulado chegam no recálculo, não no relatório', async () => {
    await request(app.getHttpServer())
      .post(`/v1/relatorio-simulado/${ID}/recalculo-anulacao`)
      .send({ cursinhoId: 'c1', solicitadoPor: 'u' })
      .expect(200);
    expect(recalculo.solicitar).toHaveBeenCalledWith(
      { simuladoIds: [ID], cursinhoId: 'c1' },
      'u',
    );
    await request(app.getHttpServer())
      .get(`/v1/relatorio-simulado/${ID}/recalculo-anulacao?cursinhoId=c1`)
      .expect(200);
    expect(recalculo.consultar).toHaveBeenCalledWith({
      simuladoIds: [ID],
      cursinhoId: 'c1',
    });
    expect(relatorio.consultar).not.toHaveBeenCalled();
  });

  it('POST/GET da prova usam os simulados da prova', async () => {
    await request(app.getHttpServer())
      .post(`/v1/relatorio-prova/${ID}/recalculo-anulacao`)
      .send({ cursinhoId: 'c1' })
      .expect(200);
    expect(recalculo.solicitar).toHaveBeenCalledWith(
      { simuladoIds: ['s1'], cursinhoId: 'c1', provaId: ID },
      undefined,
    );
    expect(relatorio.consultarProva).not.toHaveBeenCalled();
  });

  it('sem cursinhoId → 400', async () => {
    await request(app.getHttpServer())
      .post(`/v1/relatorio-simulado/${ID}/recalculo-anulacao`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .get(`/v1/relatorio-simulado/${ID}/recalculo-anulacao`)
      .expect(400);
    expect(recalculo.solicitar).not.toHaveBeenCalled();
  });
});
