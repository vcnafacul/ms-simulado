import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { semearCategoriasEnemCursinho } from '../../../scripts/seed-categorias-enem-cursinho';
import { DONO_CURSINHO, DONO_SYSTEM } from './schemas/categoria.schema';

/** tickets/038, card 01 (R1) — Mongo real: o que importa é o banco depois. */
describe('seed das categorias Enem do cursinho', () => {
  let mongo: MongoMemoryServer | undefined;
  let client: MongoClient;
  let db: Db;
  const exame = new ObjectId();

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    client = await MongoClient.connect(uri);
    db = client.db(`seed-enem-cursinho-${Date.now()}`);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await db.collection('categorias').deleteMany({});
  });

  const plataforma = () =>
    db.collection('categorias').insertMany([
      {
        nome: 'Enem Dia 1',
        dono: DONO_SYSTEM,
        duracao: 330,
        quantidadeTotalQuestao: 90,
        exame,
        deleted: false,
      },
      {
        nome: 'Enem Dia 2',
        dono: DONO_SYSTEM,
        duracao: 300,
        quantidadeTotalQuestao: 90,
        exame,
        deleted: false,
      },
    ]);

  it('cria as duas, com dono Cursinho e exame/duração/total da plataforma', async () => {
    await plataforma();

    expect(await semearCategoriasEnemCursinho(db)).toEqual([
      'Enem Dia 1',
      'Enem Dia 2',
    ]);

    const criadas = await db
      .collection('categorias')
      .find({ dono: DONO_CURSINHO })
      .sort({ nome: 1 })
      .toArray();
    expect(criadas).toMatchObject([
      {
        nome: 'Enem Dia 1',
        duracao: 330,
        // ⚠️ 90, não 95: é o total do simulado, que libera o `bloqueado`.
        quantidadeTotalQuestao: 90,
        exame,
        custom: false,
        selecionavel: true,
        deleted: false,
      },
      {
        nome: 'Enem Dia 2',
        duracao: 300,
        quantidadeTotalQuestao: 90,
        exame,
        custom: false,
        selecionavel: true,
        deleted: false,
      },
    ]);
  });

  it('é idempotente: a segunda rodada não cria nada', async () => {
    await plataforma();
    await semearCategoriasEnemCursinho(db);

    expect(await semearCategoriasEnemCursinho(db)).toEqual([]);
    expect(
      await db.collection('categorias').countDocuments({ dono: DONO_CURSINHO }),
    ).toBe(2);
  });

  it('não mexe nas da plataforma', async () => {
    await plataforma();
    const antes = await db
      .collection('categorias')
      .find({ dono: DONO_SYSTEM })
      .toArray();

    await semearCategoriasEnemCursinho(db);

    expect(
      await db.collection('categorias').find({ dono: DONO_SYSTEM }).toArray(),
    ).toEqual(antes);
  });

  it('da plataforma sem total, para — senão o simulado nunca bloquearia', async () => {
    await db.collection('categorias').insertMany([
      {
        nome: 'Enem Dia 1',
        dono: DONO_SYSTEM,
        duracao: 300,
        exame,
        deleted: false,
      },
    ]);
    await expect(semearCategoriasEnemCursinho(db)).rejects.toThrow(
      /sem quantidadeTotalQuestao/,
    );
    expect(
      await db.collection('categorias').countDocuments({ dono: DONO_CURSINHO }),
    ).toBe(0);
  });

  it('sem a da plataforma, para com erro em vez de inventar exame', async () => {
    await expect(semearCategoriasEnemCursinho(db)).rejects.toThrow(
      /da plataforma não encontrada/,
    );
    expect(await db.collection('categorias').countDocuments()).toBe(0);
  });
});
