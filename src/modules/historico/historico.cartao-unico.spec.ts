import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { HistoricoStatus } from './enums/historico-status.enum';
import { HistoricoRepository } from './historico.repository';
import { Historico, HistoricoSchema } from './historico.schema';

/**
 * Um cartão por estudante (QA): o mesmo cartão enviado duas vezes para a mesma
 * pessoa gerava dois históricos.
 *
 * ⚠️ Mongo real: o que fecha a corrida é o índice CONSTRUÍDO, e a spec do
 * schema só enxerga a declaração — ver o `caderno-template.schema.ts`.
 */
describe('um cartão por estudante — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: HistoricoRepository;
  let histModel: Model<Historico>;
  const SIM = new Types.ObjectId();

  const cartao = (over: Record<string, unknown> = {}) => ({
    usuario: 'u1',
    simulado: SIM,
    cartaoCode: '7',
    imageKey: `cartoes/${SIM}/${new Types.ObjectId()}.jpg`,
    status: HistoricoStatus.AwaitingOmr,
    ...over,
  });

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [HistoricoRepository],
    }).compile();

    repo = mod.get(HistoricoRepository);
    histModel = mod.get(getModelToken(Historico.name));
    await histModel.syncIndexes();
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await histModel.deleteMany({});
  });

  it('o índice existe, com o nome', async () => {
    const indices = await histModel.collection.indexes();

    expect(indices.map((i) => i.name)).toContain('cartao_por_estudante');
  });

  it('⚠️ o mesmo cartão para a mesma pessoa é recusado pelo banco — mesmo falho', async () => {
    await histModel.create(cartao({ status: HistoricoStatus.Failed }));

    await expect(histModel.create(cartao())).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('outro estudante, outro cartão ou outro simulado passam', async () => {
    await histModel.create(cartao());

    await histModel.create(cartao({ usuario: 'u2' }));
    await histModel.create(cartao({ cartaoCode: '8' }));
    await histModel.create(cartao({ simulado: new Types.ObjectId() }));

    expect(await histModel.countDocuments()).toBe(4);
  });

  it('⚠️ o simulado digital (sem cartão) continua podendo repetir', async () => {
    const digital = { usuario: 'u1', simulado: SIM, ano: 2026 };
    await histModel.create(digital);
    await histModel.create(digital);

    expect(await histModel.countDocuments()).toBe(2);
  });

  it('⚠️ buscarCartaoEnviado acha o cartão falho', async () => {
    await histModel.create(cartao({ status: HistoricoStatus.Failed }));

    expect(await repo.buscarCartaoEnviado('u1', String(SIM), '7')).toEqual(
      expect.objectContaining({ status: HistoricoStatus.Failed }),
    );
    expect(await repo.buscarCartaoEnviado('u2', String(SIM), '7')).toBeNull();
  });
});
