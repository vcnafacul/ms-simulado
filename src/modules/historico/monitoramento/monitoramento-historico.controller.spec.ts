import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { VALIDATION_PIPE_OPTIONS } from 'src/config/validation-pipe.config';
import { MonitoramentoHistoricoController } from './monitoramento-historico.controller';
import { MonitoramentoHistoricoService } from './monitoramento-historico.service';

/** tickets/044, card 04 — app de verdade, com o pipe global de produção. */
describe('MonitoramentoHistoricoController (044/04)', () => {
  let app: INestApplication;
  const service = {
    resumo: jest
      .fn()
      .mockResolvedValue({ historicTotal: 1, historicCompleted: 1 }),
    porPeriodo: jest.fn().mockResolvedValue([]),
    porTipo: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [MonitoramentoHistoricoController],
      providers: [
        { provide: MonitoramentoHistoricoService, useValue: service },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
    await app.init();
  });

  afterAll(() => app.close());

  it('sem cursinhoId → 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitoramento/historico/resumo')
      .expect(400);
    expect(service.resumo).not.toHaveBeenCalled();
  });

  it('resumo repassa o cursinho', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitoramento/historico/resumo?cursinhoId=abc')
      .expect(200, { historicTotal: 1, historicCompleted: 1 });
    expect(service.resumo).toHaveBeenCalledWith('abc');
  });

  it('por período: groupBy padrão é mês; inválido → 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/monitoramento/historico/por-periodo?cursinhoId=abc')
      .expect(200);
    expect(service.porPeriodo).toHaveBeenCalledWith('abc', 'month');
    await request(app.getHttpServer())
      .get('/v1/monitoramento/historico/por-tipo?cursinhoId=abc&groupBy=semana')
      .expect(400);
  });
});
