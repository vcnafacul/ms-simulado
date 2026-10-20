import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { migrar0010 } from './0010-tipo-do-file-content';

describe('migração 0010 — tipo nos FileContent antigos', () => {
  let mongo: MongoMemoryServer | undefined;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    client = await MongoClient.connect(uri);
    db = client.db(`m0010-${Date.now()}`);
  }, 120000);

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    await mongo?.stop();
  });

  it('põe documento nos sem tipo, não mexe nos que têm, e é idempotente', async () => {
    await db.collection('filecontents').insertMany([
      { fileKey: 'a', uploadedBy: 'u' },
      { fileKey: 'b', uploadedBy: 'u', tipo: 'documento' },
      { videoId: 'dQw4w9WgXcQ', uploadedBy: 'u', tipo: 'video' },
    ]);

    expect(await migrar0010(db)).toEqual({ atualizados: 1 });
    expect(await migrar0010(db)).toEqual({ atualizados: 0 });

    const tipos = (
      await db.collection('filecontents').find().sort({ _id: 1 }).toArray()
    ).map((d) => d.tipo);
    expect(tipos).toEqual(['documento', 'documento', 'video']);
  });
});
