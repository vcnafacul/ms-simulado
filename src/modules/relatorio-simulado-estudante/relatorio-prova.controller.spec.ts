import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RelatorioProvaController } from './relatorio-prova.controller';
import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

/**
 * As rotas da prova num app de verdade (tickets/034): a colisão com as rotas
 * do simulado nasce no ROTEAMENTO, e chamar o método direto não a enxerga.
 */
describe('RelatorioProvaController — rotas', () => {
  let app: INestApplication;
  const PROVA = '507f1f77bcf86cd799439011';
  const servico = {
    consultarProva: jest.fn().mockResolvedValue({ linhas: [] }),
    consultarQuestoesDaProva: jest.fn().mockResolvedValue({ questoes: [] }),
    consultar: jest.fn(),
    consultarQuestoes: jest.fn(),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [
        RelatorioSimuladoEstudanteController,
        RelatorioProvaController,
      ],
      providers: [
        { provide: RelatorioSimuladoEstudanteService, useValue: servico },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('POST /v1/relatorio-prova/:provaId → linhas da prova, 200', async () => {
    await request(app.getHttpServer())
      .post(`/v1/relatorio-prova/${PROVA}`)
      .send({ cursinhoId: 'c1', usuarios: ['u1'] })
      .expect(200);

    expect(servico.consultarProva).toHaveBeenCalledWith({
      provaId: PROVA,
      cursinhoId: 'c1',
      usuarios: ['u1'],
    });
    expect(servico.consultar).not.toHaveBeenCalled();
  });

  it('POST /v1/relatorio-prova/:provaId/questoes → questões da prova, 200', async () => {
    await request(app.getHttpServer())
      .post(`/v1/relatorio-prova/${PROVA}/questoes`)
      .send({ cursinhoId: 'c1' })
      .expect(200);

    expect(servico.consultarQuestoesDaProva).toHaveBeenCalledWith({
      provaId: PROVA,
      cursinhoId: 'c1',
      usuarios: undefined,
    });
    expect(servico.consultarQuestoes).not.toHaveBeenCalled();
    expect(servico.consultarProva).not.toHaveBeenCalled();
  });

  it('provaId inválido → 400, e o serviço nem é chamado', async () => {
    await request(app.getHttpServer())
      .post('/v1/relatorio-prova/abc')
      .send({ cursinhoId: 'c1' })
      .expect(400);
    expect(servico.consultarProva).not.toHaveBeenCalled();
  });

  it('sem cursinhoId → 400', async () => {
    await request(app.getHttpServer())
      .post(`/v1/relatorio-prova/${PROVA}`)
      .send({})
      .expect(400);
    expect(servico.consultarProva).not.toHaveBeenCalled();
  });

  it('as rotas do simulado continuam respondendo pelo handler delas', async () => {
    servico.consultar.mockResolvedValue({ linhas: [] });
    await request(app.getHttpServer())
      .post(`/v1/relatorio-simulado/${PROVA}`)
      .send({ cursinhoId: 'c1' })
      .expect(200);
    expect(servico.consultar).toHaveBeenCalled();
    expect(servico.consultarProva).not.toHaveBeenCalled();
  });
});
