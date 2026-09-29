import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { HistoricoStatus } from './enums/historico-status.enum';
import { HistoricoRepository } from './historico.repository';
import { Historico, HistoricoSchema } from './historico.schema';

/** tickets/026, card 05 — quem fez pelo cartão, Mongo real. */
describe('participantesPorCartao — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: HistoricoRepository;
  let model: Model<Historico>;

  const S1 = new Types.ObjectId();
  const S2 = new Types.ObjectId();
  const SEM = new Types.ObjectId();
  const desde = new Date('2026-10-01T00:00:00Z');
  const depois = new Date('2026-10-05T00:00:00Z');

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `participantes-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [HistoricoRepository],
    }).compile();
    repo = mod.get(HistoricoRepository);
    model = mod.get(getModelToken(Historico.name));

    const h = (over: Record<string, unknown>) => ({
      simulado: S1,
      usuario: 'u-ok',
      cartaoCode: 'C1',
      status: HistoricoStatus.Completed,
      createdAt: depois,
      respostas: [] as unknown[],
      ...over,
    });
    await model.collection.insertMany([
      h({}),
      h({ cartaoCode: 'C2' }), // o mesmo aluno com dois cartões: conta 1
      h({ usuario: 'u-digital', cartaoCode: undefined }), // simulado digital
      h({ usuario: 'u-falhou', status: HistoricoStatus.Failed }),
      h({ usuario: 'u-pendente', status: HistoricoStatus.AwaitingOmr }),
      h({ usuario: 'u-antes', createdAt: new Date('2026-09-20T00:00:00Z') }),
      h({ usuario: 'u-excluido', deleted: true }),
      h({ simulado: S2, usuario: 'u-es' }),
    ]);
  });

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  it('só cartão completed, desde o início, por simulado — sem repetir aluno', async () => {
    const r = await repo.participantesPorCartao(
      [String(S1), String(S2), String(SEM)],
      desde,
    );
    expect(r).toEqual({
      [String(S1)]: ['u-ok'],
      [String(S2)]: ['u-es'],
      [String(SEM)]: [],
    });
  });
});
