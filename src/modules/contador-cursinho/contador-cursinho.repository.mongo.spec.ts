import { MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContadorCursinhoRepository } from './contador-cursinho.repository';
import {
  ContadorCursinho,
  ContadorCursinhoSchema,
} from './contador-cursinho.schema';

/** tickets/025, card 02 — `$inc` com upsert, Mongo real. */
describe('ContadorCursinhoRepository — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: ContadorCursinhoRepository;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `contador-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: ContadorCursinho.name, schema: ContadorCursinhoSchema },
        ]),
      ],
      providers: [ContadorCursinhoRepository],
    }).compile();
    repo = mod.get(ContadorCursinhoRepository);
  });

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  it('cursinho sem registro → 0', async () => {
    expect(await repo.aprovadas('nunca')).toBe(0);
  });

  it('o primeiro cria, os seguintes somam — inclusive em paralelo', async () => {
    await repo.incrementarAprovadas('A');
    await Promise.all([1, 2, 3, 4].map(() => repo.incrementarAprovadas('A')));
    await repo.incrementarAprovadas('B');
    expect(await repo.aprovadas('A')).toBe(5);
    expect(await repo.aprovadas('B')).toBe(1);
  });
});
