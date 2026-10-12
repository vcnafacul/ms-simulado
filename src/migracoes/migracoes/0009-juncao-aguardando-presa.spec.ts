import { Db, MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { migrar0009 } from './0009-juncao-aguardando-presa';

/** Migração 0009 — Mongo real, com o índice único antigo de homol/prod presente. */
describe('migração 0009 — linhas aguardando presas', () => {
  let mongo: MongoMemoryServer | undefined;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    client = await MongoClient.connect(uri);
    db = client.db(`m0009-${Date.now()}`);
    await db
      .collection('relatoriosimuladoestudantes')
      .createIndex(
        { historico: 1, cursinhoId: 1 },
        { unique: true, name: 'historico_1_cursinhoId_1' },
      );
  }, 120000);

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    await mongo?.stop();
  });

  it('move a presa (simulado embutido ou id), deixa a que ainda não tem simulado, e é idempotente', async () => {
    const [simEsp, simIng] = [new ObjectId(), new ObjectId()];
    const [hEmbutido, hId, hPendente] = [
      new ObjectId(),
      new ObjectId(),
      new ObjectId(),
    ];
    const criadoEm = new Date('2026-10-11T22:00:00Z');
    await db.collection('historicos').insertMany([
      // o bug antigo do completeProcessing grava o simulado inteiro
      {
        _id: hEmbutido,
        simulado: { _id: simEsp, nome: 'P Espanhol' },
        status: 'completed',
      },
      { _id: hId, simulado: simIng, status: 'completed' },
      { _id: hPendente, simulado: null, status: 'awaiting_omr' },
    ]);
    const aguardando = (historico: ObjectId, usuario: string) => ({
      historico,
      usuario,
      cursinhoId: 'c1',
      turmaId: 't1',
      prova: new ObjectId(),
      aguardandoSimulado: true,
      createdAt: criadoEm,
    });
    await db
      .collection('relatoriosimuladoestudantes')
      .insertMany([
        aguardando(hEmbutido, 'u1'),
        aguardando(hId, 'u2'),
        aguardando(hPendente, 'u3'),
      ]);

    expect(await migrar0009(db)).toEqual({
      aguardando: 3,
      movidas: 2,
      aindaSemSimulado: 1,
    });
    const linhas = await db
      .collection('relatoriosimuladoestudantes')
      .find({})
      .sort({ usuario: 1 })
      .toArray();
    expect(
      linhas.map((l) => [
        l.usuario,
        l.simulado ? String(l.simulado) : null,
        l.aguardandoSimulado ?? null,
      ]),
    ).toEqual([
      ['u1', String(simEsp), null],
      ['u2', String(simIng), null],
      ['u3', null, true],
    ]);
    expect(linhas[0]).toMatchObject({ turmaId: 't1', createdAt: criadoEm });

    expect(await migrar0009(db)).toEqual({
      aguardando: 1,
      movidas: 0,
      aindaSemSimulado: 1,
    });
  });
});
