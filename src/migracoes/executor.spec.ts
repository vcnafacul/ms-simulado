import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { COLECAO_REGISTRO, rodarMigracoes } from './executor';
import { MIGRACOES, Passo, SEEDS } from './registro';

/** As migrações automáticas do deploy — Mongo real: o registro e a trava são do banco. */
describe('rodarMigracoes — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let client: MongoClient;
  let db: Db;
  const silencio = (): void => undefined;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    client = await MongoClient.connect(uri);
  }, 120000);

  afterAll(async () => {
    await client.close();
    await mongo?.stop();
  });

  let n = 0;
  beforeEach(() => {
    db = client.db(`migracoes-${Date.now()}-${n++}`);
  });
  afterEach(async () => {
    await db.dropDatabase();
  });

  const passo = (
    id: string,
    executar: jest.Mock = jest.fn(async (): Promise<unknown> => 'feito'),
  ): Passo & { executar: jest.Mock } => ({ id, descricao: `passo ${id}`, executar });

  it('roda as que faltam, em ordem, e registra; na 2ª vez não roda de novo', async () => {
    const ordem: string[] = [];
    const a = passo(
      'a',
      jest.fn(async () => ordem.push('a')),
    );
    const b = passo(
      'b',
      jest.fn(async () => ordem.push('b')),
    );

    const r1 = await rodarMigracoes(
      db,
      { migracoes: [a, b], seeds: [] },
      silencio,
    );
    expect(r1.aplicadas).toEqual(['a', 'b']);
    expect(ordem).toEqual(['a', 'b']);

    const r2 = await rodarMigracoes(
      db,
      { migracoes: [a, b], seeds: [] },
      silencio,
    );
    expect(r2).toMatchObject({ aplicadas: [], jaAplicadas: ['a', 'b'] });
    expect(a.executar).toHaveBeenCalledTimes(1);

    const registro = await db
      .collection(COLECAO_REGISTRO)
      .find({ tipo: 'migracao' })
      .toArray();
    expect(registro.map((d) => d._id)).toEqual(['a', 'b']);
    expect(registro[0]).toMatchObject({
      descricao: 'passo a',
      aplicadaEm: expect.any(Date),
    });
  });

  it('só roda a NOVA quando uma entra depois', async () => {
    const a = passo('a');
    await rodarMigracoes(db, { migracoes: [a], seeds: [] }, silencio);
    const b = passo('b');
    const r = await rodarMigracoes(
      db,
      { migracoes: [a, b], seeds: [] },
      silencio,
    );
    expect(r.aplicadas).toEqual(['b']);
    expect(a.executar).toHaveBeenCalledTimes(1);
  });

  it('⚠️ migração que falha: lança, não registra, não roda as seguintes e libera a trava', async () => {
    const quebra = passo(
      'quebra',
      jest.fn(async () => {
        throw new Error('boom');
      }),
    );
    const depois = passo('depois');

    await expect(
      rodarMigracoes(db, { migracoes: [quebra, depois], seeds: [] }, silencio),
    ).rejects.toThrow('boom');
    expect(depois.executar).not.toHaveBeenCalled();
    expect(await db.collection(COLECAO_REGISTRO).countDocuments()).toBe(0);

    // a trava saiu: a próxima execução roda (e tenta a que falhou de novo)
    quebra.executar.mockResolvedValue('agora foi');
    const r = await rodarMigracoes(
      db,
      { migracoes: [quebra, depois], seeds: [] },
      silencio,
    );
    expect(r.aplicadas).toEqual(['quebra', 'depois']);
  });

  it('seed roda em TODO deploy; o que falha fica registrado e não derruba', async () => {
    const ok = passo('seed:ok');
    const ruim = passo(
      'seed:ruim',
      jest.fn(async () => {
        throw new Error('sem plataforma');
      }),
    );

    await rodarMigracoes(db, { migracoes: [], seeds: [ok, ruim] }, silencio);
    const r = await rodarMigracoes(
      db,
      { migracoes: [], seeds: [ok, ruim] },
      silencio,
    );

    expect(ok.executar).toHaveBeenCalledTimes(2);
    expect(r.seeds).toEqual([
      { id: 'seed:ok', ok: true, resultado: 'feito' },
      { id: 'seed:ruim', ok: false, resultado: 'sem plataforma' },
    ]);
    expect(
      await db
        .collection(COLECAO_REGISTRO)
        .findOne({ _id: 'seed:ruim' as never }),
    ).toMatchObject({ tipo: 'seed', ok: false });
  });

  it('⚠️ duas execuções juntas (duas instâncias subindo): a migração roda UMA vez', async () => {
    const lenta = passo(
      'lenta',
      jest.fn(async () => new Promise((r) => setTimeout(() => r('ok'), 300))),
    );
    await Promise.all([
      rodarMigracoes(db, { migracoes: [lenta], seeds: [] }, silencio),
      rodarMigracoes(db, { migracoes: [lenta], seeds: [] }, silencio),
    ]);
    expect(lenta.executar).toHaveBeenCalledTimes(1);
  }, 30000);

  it('o registro real: ids únicos, começando na 0007; os seeds de verdade rodam num banco vazio sem quebrar o deploy', async () => {
    const ids = [...MIGRACOES, ...SEEDS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MIGRACOES[0].id).toMatch(/^0007-/);

    const r = await rodarMigracoes(
      db,
      { migracoes: MIGRACOES, seeds: SEEDS },
      silencio,
    );
    expect(r.aplicadas).toEqual(MIGRACOES.map((m) => m.id));
    // banco vazio: o modelo do caderno entra; as categorias falham (sem as da plataforma)
    expect(r.seeds.map((s) => [s.id, s.ok])).toEqual([
      ['seed:template-caderno', true],
      ['seed:categorias-enem-cursinho', false],
    ]);
    expect(await db.collection('cadernotemplates').countDocuments()).toBe(1);
  });
});
