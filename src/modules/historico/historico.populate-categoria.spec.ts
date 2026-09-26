import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  Categoria,
  CategoriaSchema,
} from '../categoria/schemas/categoria.schema';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { HistoricoRepository } from './historico.repository';
import { Historico, HistoricoSchema } from './historico.schema';

/**
 * O client lê `simulado.categoria.nome` e `simulado.categoria.quantidadeTotalQuestao`
 * no card da lista de histórico e no cabeçalho do detalhe. Quando o `populate`
 * de `tipo` saiu (b5962f9), a `categoria` nunca entrou no lugar: a lista vinha
 * sem ela e a tela de simulado quebrava inteira no card.
 *
 * ⚠️ Mongo real: o defeito está no que o `populate` devolve, e um dublê do
 * `populate` devolveria o que eu mandasse devolver.
 */
describe('HistoricoRepository — simulado.categoria populada (Mongo real)', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: HistoricoRepository;
  let histModel: Model<Historico>;
  let simModel: Model<Simulado>;
  let catModel: Model<Categoria>;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Categoria.name, schema: CategoriaSchema },
          { name: Questao.name, schema: QuestaoSchema },
        ]),
      ],
      providers: [HistoricoRepository],
    }).compile();

    repo = mod.get(HistoricoRepository);
    histModel = mod.get(getModelToken(Historico.name));
    simModel = mod.get(getModelToken(Simulado.name));
    catModel = mod.get(getModelToken(Categoria.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      histModel.deleteMany({}),
      simModel.deleteMany({}),
      catModel.deleteMany({}),
    ]);
  });

  async function historicoDeUmSimulado() {
    const categoria = await catModel.create({
      nome: 'ENEM Dia 1',
      quantidadeTotalQuestao: 90,
      exame: new Types.ObjectId(),
    });
    const simulado = await simModel.create({
      nome: 'Simulado ENEM 1',
      categoria: categoria._id,
    });
    const historico = await histModel.create({
      usuario: 'u1',
      ano: 2026,
      simulado: simulado._id,
      respostas: [],
    });
    return { historico };
  }

  it('⚠️ getAllByUser devolve a categoria com nome e total de questões', async () => {
    await historicoDeUmSimulado();

    const { data } = await repo.getAllByUser({
      userId: 'u1',
      page: 1,
      limit: 10,
    });

    const categoria = (data[0].simulado as any).categoria;
    expect(categoria).toMatchObject({
      nome: 'ENEM Dia 1',
      quantidadeTotalQuestao: 90,
    });
  });

  it('getAllByUser continua sem trazer as questões do simulado', async () => {
    await historicoDeUmSimulado();

    const { data } = await repo.getAllByUser({
      userId: 'u1',
      page: 1,
      limit: 10,
    });

    expect((data[0].simulado as any).questoes).toBeUndefined();
  });

  it('⚠️ getByIdAndUsuario (detalhe) também devolve a categoria', async () => {
    const { historico } = await historicoDeUmSimulado();

    const doc = await repo.getByIdAndUsuario(String(historico._id), 'u1');

    expect((doc.simulado as any).categoria).toMatchObject({
      nome: 'ENEM Dia 1',
      quantidadeTotalQuestao: 90,
    });
  });
});
