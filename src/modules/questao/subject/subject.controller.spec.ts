import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';

/**
 * As rotas literais de `subject` não podem ser engolidas pelo `:id`.
 *
 * ⚠️ **Só um app de verdade pega isto.** A colisão não existe no controller —
 * ela nasce no roteamento. Chamar `controller.changeOrder(...)` direto sempre
 * funciona, e é por isso que nenhum teste de unidade acusaria.
 *
 * O que estava acontecendo: `@Patch(':id')` era declarado **antes** de
 * `@Patch('order')` e `@Patch('swap-order')`. No Express a primeira rota que
 * casa vence, então `PATCH /v1/subject/order` caía no `update()` com
 * `id = "order"` — e reordenar matéria estava quebrado ponta a ponta, porque a
 * api chama exatamente essas duas rotas (`subject.service.ts:50-55`).
 *
 * O conserto é a ordem de declaração, que é a convenção que os outros ~55
 * pares literal/param destes dois repos já seguem. Este teste existe para a
 * ordem não voltar a inverter em silêncio.
 */
describe('SubjectController — as rotas literais vencem o :id', () => {
  let app: INestApplication;

  const service = {
    changeOrder: jest.fn().mockResolvedValue(undefined),
    swapOrder: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [SubjectController],
      providers: [{ provide: SubjectService, useValue: service }],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.changeOrder.mockClear();
    service.swapOrder.mockClear();
    service.update.mockClear();
  });

  it('PATCH /order chega no changeOrder, não no update', async () => {
    await request(app.getHttpServer())
      .patch('/v1/subject/order')
      .send({ subjectId: '65ecc850a528b39d273e7900', newOrder: 2 })
      .expect(200);

    expect(service.changeOrder).toHaveBeenCalledWith(
      '65ecc850a528b39d273e7900',
      2,
    );
    // ⚠️ A asserção que separa "respondeu" de "respondeu pelo caminho certo".
    expect(service.update).not.toHaveBeenCalled();
  });

  it('PATCH /swap-order chega no swapOrder, não no update', async () => {
    await request(app.getHttpServer())
      .patch('/v1/subject/swap-order')
      .send({ id1: 'a', id2: 'b' })
      .expect(200);

    expect(service.swapOrder).toHaveBeenCalledWith('a', 'b');
    expect(service.update).not.toHaveBeenCalled();
  });

  it('PATCH /:id continua chegando no update', async () => {
    // ⚠️ O par dos dois acima: mover os literais para cima não pode ter
    // quebrado a rota que já funcionava.
    await request(app.getHttpServer())
      .patch('/v1/subject/65ecc850a528b39d273e7900')
      .send({ nome: 'Álgebra' })
      .expect(200);

    expect(service.update).toHaveBeenCalledWith(
      '65ecc850a528b39d273e7900',
      expect.objectContaining({ nome: 'Álgebra' }),
    );
    expect(service.changeOrder).not.toHaveBeenCalled();
    expect(service.swapOrder).not.toHaveBeenCalled();
  });
});
