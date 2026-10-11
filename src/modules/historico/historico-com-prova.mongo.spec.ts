import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { migrar0007 } from '../../../scripts/migrations/0007-historico-prova/migrar';
import { HistoricoRepository } from './historico.repository';
import { Historico, HistoricoSchema } from './historico.schema';

/**
 * tickets/038, card 05 — histórico com prova, Mongo real: os índices únicos e
 * a migração só se provam contra o banco.
 */
describe('histórico com prova (tickets/038 · 05) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let historicos: Model<Historico>;
  let provas: Model<Prova>;
  let repo: HistoricoRepository;
  let provaRepo: ProvaRepository;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `hist-prova-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
          { name: Prova.name, schema: ProvaSchema },
          { name: Simulado.name, schema: SimuladoSchema },
        ]),
      ],
      providers: [HistoricoRepository, ProvaRepository],
    }).compile();
    historicos = mod.get(getModelToken(Historico.name));
    provas = mod.get(getModelToken(Prova.name));
    repo = mod.get(HistoricoRepository);
    provaRepo = mod.get(ProvaRepository);
    await historicos.syncIndexes();
  }, 120000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await historicos.deleteMany({});
    await provas.collection.deleteMany({});
  });

  const id = () => new Types.ObjectId().toString();
  let n = 0;
  const cartao = (o: Record<string, unknown>) =>
    repo.createAwaitingOmr({
      usuario: 'u1',
      simuladoId: null,
      imageKey: `cartoes/x/${++n}.jpg`,
      cartaoCode: '001',
      tentativaId: 't',
      ...o,
    } as never);

  it('aceita cartão com prova e sem simulado', async () => {
    const provaId = id();
    const h = await cartao({ provaId, cartaoDaProva: true });
    const salvo = await historicos.findById(h._id).lean();
    expect(salvo).toMatchObject({ simulado: null, cartaoDaProva: true });
    expect(String(salvo!.prova)).toBe(provaId);
  });

  it('⚠️ dois cartões DA PROVA para o mesmo aluno e prova → recusado pelo índice', async () => {
    const provaId = id();
    await cartao({ provaId, cartaoDaProva: true, cartaoCode: '001' });
    await expect(
      cartao({ provaId, cartaoDaProva: true, cartaoCode: '002' }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await repo.buscarCartaoDaProvaEnviado('u1', provaId)).toMatchObject({
      status: 'awaiting_omr',
    });
  });

  it('cartões de simulados diferentes da mesma prova → aceitos (como hoje)', async () => {
    const provaId = id();
    await cartao({ provaId, simuladoId: id() });
    await expect(cartao({ provaId, simuladoId: id() })).resolves.toBeDefined();
    expect(await repo.buscarCartaoDaProvaEnviado('u1', provaId)).toBeNull();
  });

  it('o mesmo aluno em provas diferentes → aceito', async () => {
    await cartao({ provaId: id(), cartaoDaProva: true });
    await expect(
      cartao({ provaId: id(), cartaoDaProva: true }),
    ).resolves.toBeDefined();
  });

  it('contador da prova é independente do do simulado', async () => {
    const p = await provas.collection.insertOne({ nome: 'P', simulados: [] });
    const provaId = String(p.insertedId);
    expect(await provaRepo.incrementarCartaoSeq(provaId)).toBe(1);
    expect(await provaRepo.incrementarCartaoSeq(provaId)).toBe(2);
  });

  it('buscarProvaDoSimulado: a viva que o contém; nenhuma → null', async () => {
    const sim = new Types.ObjectId();
    await provas.collection.insertOne({
      nome: 'apagada',
      simulados: [sim],
      deleted: true,
    });
    const viva = await provas.collection.insertOne({
      nome: 'viva',
      simulados: [sim],
    });
    expect(
      String((await provaRepo.buscarProvaDoSimulado(String(sim)))!._id),
    ).toBe(String(viva.insertedId));
    expect(await provaRepo.buscarProvaDoSimulado(id())).toBeNull();
  });

  it('"alguém fez a prova" conta o cartão da prova sem simulado', async () => {
    const provaId = id();
    expect(await repo.contarPorSimulados([id()], provaId)).toBe(0);
    await cartao({ provaId, cartaoDaProva: true });
    expect(await repo.contarPorSimulados([id()], provaId)).toBe(1);
    expect(await repo.contarPorSimulados([], undefined)).toBe(0);
  });

  it('a lista do aluno traz a prova; o desempenho ignora o cartão sem simulado', async () => {
    const p = await provas.collection.insertOne({
      nome: 'Prova X',
      simulados: [],
    });
    await cartao({ provaId: String(p.insertedId), cartaoDaProva: true });

    const lista = await repo.getAllByUser({
      userId: 'u1',
      page: 1,
      limit: 10,
    } as never);
    expect((lista.data[0] as any).prova.nome).toBe('Prova X');
    expect(await repo.getToPerformance('u1')).toEqual([]);
  });

  describe('migração 0007', () => {
    const db = () => historicos.db.db!;

    it('conta, preenche, é idempotente e deixa sem prova o simulado sem prova', async () => {
      // O banco de hoje tem o v1 (migração 0006).
      await historicos.collection.createIndex(
        { usuario: 1, simulado: 1, cartaoCode: 1 },
        {
          unique: true,
          name: 'cartao_por_estudante',
          partialFilterExpression: { cartaoCode: { $type: 'string' } },
        },
      );
      const [sEmProva, sSolto] = [new Types.ObjectId(), new Types.ObjectId()];
      const p = await provas.collection.insertOne({
        nome: 'P',
        simulados: [sEmProva],
      });
      await historicos.collection.insertMany([
        { usuario: 'a', simulado: sEmProva, cartaoCode: '001' },
        { usuario: 'b', simulado: sEmProva, cartaoCode: '002' },
        { usuario: 'c', simulado: sSolto, cartaoCode: '001' },
        // digital: sem cartão, não é tocado
        { usuario: 'd', simulado: sEmProva },
      ]);

      const contagem = await migrar0007(db(), false);
      expect(contagem).toMatchObject({
        historicosSemProva: 3,
        preenchidos: 0,
        simuladosSemProva: 1,
      });
      expect(await historicos.countDocuments({ prova: { $ne: null } })).toBe(0);

      const aplicada = await migrar0007(db(), true);
      expect(aplicada).toMatchObject({
        preenchidos: 2,
        indice: true,
        indiceV2: true,
        indiceV1: false,
      });
      const comProva = await historicos.collection
        .find({ prova: p.insertedId })
        .toArray();
      expect(comProva.map((h) => h.usuario).sort()).toEqual(['a', 'b']);

      const segunda = await migrar0007(db(), true);
      expect(segunda).toMatchObject({ historicosSemProva: 1, preenchidos: 0 });
    });
  });
});
