import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';

/**
 * Banco de questões filtrado por prova vem na ordem do `numero` naquela prova,
 * e não pelo `updatedAt` — o número mora em `Prova.questoes[].numero`.
 */
describe('listagem filtrada por prova — ordem do número (Mongo real)', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let questoes: Model<Questao>;
  let repo: QuestaoRepository;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [QuestaoRepository],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    questoes = mod.get(getModelToken(Questao.name));
    repo = mod.get(QuestaoRepository);
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const questao = async (extra: object = {}) =>
    (
      await questoes.collection.insertOne({
        status: 0,
        updatedAt: new Date(),
        ...extra,
      } as never)
    ).insertedId;

  let Q1: Types.ObjectId, Q2: Types.ObjectId, Q3: Types.ObjectId;
  let Q4: Types.ObjectId, Qexcluida: Types.ObjectId;
  let P: string;
  beforeAll(async () => {
    // updatedAt decrescente ≠ ordem numérica, para o teste pegar a regressão.
    Q3 = await questao({ updatedAt: new Date('2026-01-04') });
    Q1 = await questao({ updatedAt: new Date('2026-01-01'), status: 1 });
    Qexcluida = await questao({ deleted: true });
    Q2 = await questao({ updatedAt: new Date('2026-01-03') });
    Q4 = await questao({ updatedAt: new Date('2026-01-02') });
    P = (
      await provas.collection.insertOne({
        nome: 'P',
        simulados: [],
        questoes: [
          { questao: Q3, numero: 3 },
          { questao: Q4, numero: 2 }, // mesmo número de Q2: ordem do array
          { questao: Qexcluida, numero: 1 },
          { questao: Q2, numero: 2 },
          { questao: Q1, numero: 1 },
        ],
      } as never)
    ).insertedId.toString();
  });

  const listar = async (page: number, limit: number, where: object = {}) => {
    const ordemIds = await repo.findQuestaoIdsByProva(P);
    return repo.getAll({
      page,
      limit,
      where: { ...where, _id: { $in: ordemIds } },
      or: [],
      sortColumn: 'updatedAt',
      sortOrder: 'desc',
      ordemIds,
    });
  };
  const ids = (r: { data: Questao[] }) => r.data.map((q) => String(q._id));

  it('ordena pelo número, desempata pela ordem na prova e ignora excluída', async () => {
    const r = await listar(1, 10);
    expect(ids(r)).toEqual([Q1, Q4, Q2, Q3].map(String));
    expect(r.totalItems).toBe(4);
  });

  it('pagina depois de ordenar', async () => {
    expect(ids(await listar(1, 2))).toEqual([Q1, Q4].map(String));
    const p2 = await listar(2, 2);
    expect(ids(p2)).toEqual([Q2, Q3].map(String));
    expect(p2.totalItems).toBe(4);
  });

  it('aplica os demais filtros antes de paginar', async () => {
    const r = await listar(1, 10, { status: 0 });
    expect(ids(r)).toEqual([Q4, Q2, Q3].map(String));
    expect(r.totalItems).toBe(3);
  });
});
