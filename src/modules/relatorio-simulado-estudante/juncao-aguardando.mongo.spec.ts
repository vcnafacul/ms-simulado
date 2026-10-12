import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { migrar0008 } from '../../../scripts/migrations/0008-juncao-aguardando-simulado/migrar';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

/**
 * tickets/038, card 13 — a linha "aguardando simulado" do cartão da prova, no Mongo real: o
 * índice parcial e o `moverParaSimulado` só se provam contra o banco.
 */
describe('junção aguardando simulado (tickets/038 · 13) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let model: Model<RelatorioSimuladoEstudante>;
  let repo: RelatorioSimuladoEstudanteRepository;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `juncao-${Date.now()}` }),
        MongooseModule.forFeature([
          {
            name: RelatorioSimuladoEstudante.name,
            schema: RelatorioSimuladoEstudanteSchema,
          },
          // a série popula o histórico
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [RelatorioSimuladoEstudanteRepository],
    }).compile();
    model = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    repo = mod.get(RelatorioSimuladoEstudanteRepository);
    await model.syncIndexes();
  }, 120000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  const id = () => new Types.ObjectId().toString();
  const aguardando = (o: Record<string, string> = {}) =>
    repo.registrarAguardando({
      historicoId: id(),
      provaId: id(),
      usuario: 'u1',
      cursinhoId: 'c1',
      ...o,
    });

  it('⚠️ duas linhas aguardando do mesmo aluno (provas diferentes) não colidem', async () => {
    await aguardando();
    await expect(aguardando()).resolves.toBeUndefined();
    expect(await model.countDocuments({ aguardandoSimulado: true })).toBe(2);
  });

  it('o gate do reenvio/foto/exclusão acha a linha aguardando pelo histórico', async () => {
    const historicoId = id();
    await aguardando({ historicoId });
    expect(await repo.buscarPorHistorico(historicoId, 'c1')).toMatchObject({
      usuario: 'u1',
      aguardandoSimulado: true,
    });
    expect(await repo.buscarPorHistorico(historicoId, 'outro')).toBeNull();
  });

  it('moverParaSimulado: vira linha do simulado, com cursinho e turma, e a aguardando some', async () => {
    const historicoId = id();
    const simuladoId = id();
    await aguardando({ historicoId, turmaId: 't1' });

    await repo.moverParaSimulado(historicoId, simuladoId);

    const linhas = await model
      .find({ historico: new Types.ObjectId(historicoId) })
      .lean();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ cursinhoId: 'c1', turmaId: 't1' });
    expect(String(linhas[0].simulado)).toBe(simuladoId);
    expect(linhas[0].aguardandoSimulado).toBeUndefined();
  });

  it('reenvio que troca o idioma: a linha muda de simulado', async () => {
    const historicoId = id();
    const [ing, esp] = [id(), id()];
    await aguardando({ historicoId });
    await repo.moverParaSimulado(historicoId, ing);
    await repo.moverParaSimulado(historicoId, esp);

    const linhas = await model
      .find({ historico: new Types.ObjectId(historicoId) })
      .lean();
    expect(linhas.map((l) => String(l.simulado))).toEqual([esp]);
  });

  it('a unicidade por simulado segue valendo', async () => {
    const simulado = id();
    await repo.registrar({
      historicoId: id(),
      simuladoId: simulado,
      usuario: 'u1',
      cursinhoId: 'c1',
    });
    await expect(
      // ⚠️ ObjectId de verdade: o schema usa `Types.ObjectId` como tipo, e com ele o Mongoose
      // não converte string — uma string em `simulado` ficaria fora do índice parcial.
      model.create({
        historico: new Types.ObjectId(),
        simulado: new Types.ObjectId(simulado),
        usuario: 'u1',
        cursinhoId: 'c1',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('migração 0008: troca o índice antigo pelo parcial, e é idempotente', async () => {
    const db = model.db.db!;
    const col = db.collection('juncao_migracao');
    // simula o banco de hoje numa coleção à parte
    await col.createIndex(
      { simulado: 1, cursinhoId: 1, usuario: 1 },
      { unique: true },
    );
    const original = await import(
      '../../../scripts/migrations/0008-juncao-aguardando-simulado/migrar'
    );
    const colecaoReal = original.COLECAO;
    // a função usa a coleção real: prepara-a no estado de hoje
    await db.collection(colecaoReal).dropIndexes();
    await db
      .collection(colecaoReal)
      .createIndex(
        { simulado: 1, cursinhoId: 1, usuario: 1 },
        { unique: true },
      );

    expect(await migrar0008(db, false)).toEqual({
      antigo: true,
      novo: false,
      aguardando: false,
    });
    expect(await migrar0008(db, true)).toEqual({
      antigo: false,
      novo: true,
      aguardando: true,
    });
    expect(await migrar0008(db, true)).toEqual({
      antigo: false,
      novo: true,
      aguardando: true,
    });
    await col.drop();
  });

  describe('conserto achado em homol (2026-10-12)', () => {
    const indiceAntigo = () =>
      model.collection.createIndex(
        { historico: 1, cursinhoId: 1 },
        { unique: true, name: 'historico_1_cursinhoId_1' },
      );
    afterEach(async () => {
      await model.collection
        .dropIndex('historico_1_cursinhoId_1')
        .catch(() => undefined);
    });

    it('⚠️ mover funciona com o índice único ANTIGO {historico, cursinhoId} (homol/prod)', async () => {
      await indiceAntigo();
      const historicoId = id();
      const simuladoId = id();
      await aguardando({ historicoId, turmaId: 't1' });

      await expect(
        repo.moverParaSimulado(historicoId, simuladoId),
      ).resolves.toBeUndefined();

      const linhas = await model
        .find({ historico: new Types.ObjectId(historicoId) })
        .lean();
      expect(linhas.map((l) => String(l.simulado))).toEqual([simuladoId]);
      expect(linhas[0].aguardandoSimulado).toBeUndefined();
    });

    it('a lista de simulados com cartão ignora a linha aguardando (antes: 500)', async () => {
      const simuladoId = id();
      await repo.registrar({
        historicoId: id(),
        simuladoId,
        usuario: 'u2',
        cursinhoId: 'c1',
      });
      await aguardando();

      const lista = await repo.listarSimuladosComCartao({ cursinhoId: 'c1' });
      expect(lista.map((l) => l.simuladoId)).toEqual([simuladoId]);
    });

    it('a série do estudante ignora a linha aguardando', async () => {
      await aguardando();
      await expect(
        repo.serieDoEstudante({ cursinhoId: 'c1', usuario: 'u1' }),
      ).resolves.toEqual([]);
    });
  });
});
