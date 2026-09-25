import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Materia, MateriaSchema } from '../materia/materia.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { Questao, QuestaoSchema, vazioViraNull } from './questao.schema';

/**
 * Frente gravada como `""` derrubava o populate do simulado
 * (contagem-por-materia 04).
 *
 * ⚠️ Mongo real: o que se mede é o que o Mongoose GRAVA, e sem o setter ele
 * grava `""` tal e qual num campo `ObjectId`.
 */
describe('referência vazia na questão — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let questoes: Model<Questao>;

  const cru = async (id: unknown) =>
    questoes.collection.findOne(
      { _id: id as Types.ObjectId },
      { projection: { frente1: 1, frente2: 1, frente3: 1, materia: 1 } },
    );

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Frente.name, schema: FrenteSchema },
          { name: Materia.name, schema: MateriaSchema },
        ]),
      ],
      providers: [SimuladoRepository],
    }).compile();
    questoes = mod.get(getModelToken(Questao.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  it('vazioViraNull só mexe na string vazia', () => {
    expect(vazioViraNull('')).toBeNull();
    const id = new Types.ObjectId();
    expect(vazioViraNull(id)).toBe(id);
    expect(vazioViraNull(null)).toBeNull();
    expect(vazioViraNull(undefined)).toBeUndefined();
  });

  it('⚠️ create com "" grava null', async () => {
    const q = await questoes.create({
      frente1: '',
      frente2: '',
      frente3: '',
      materia: '',
    } as any);

    expect(await cru(q._id)).toMatchObject({
      frente1: null,
      frente2: null,
      frente3: null,
      materia: null,
    });
  });

  it('⚠️ updateOne e findByIdAndUpdate com "" gravam null', async () => {
    const id = new Types.ObjectId();
    await questoes.collection.insertOne({
      _id: id,
      frente2: String(new Types.ObjectId()),
      frente3: String(new Types.ObjectId()),
    });

    await questoes.updateOne({ _id: id }, { $set: { frente2: '' } });
    await questoes.findByIdAndUpdate(id, { frente3: '' });

    expect(await cru(id)).toMatchObject({ frente2: null, frente3: null });
  });

  it('⚠️ o answer() do simulado volta a funcionar com a frente nula', async () => {
    const db = questoes.db;
    const materia = new Types.ObjectId();
    const frente = new Types.ObjectId();
    await db.collection('materias').insertOne({ _id: materia, nome: 'M' });
    await db
      .collection('frentes')
      .insertOne({ _id: frente, nome: 'F', materia: String(materia) });
    const questao = await questoes.create({
      alternativa: 'A',
      materia: String(materia),
      frente1: String(frente),
      frente3: '',
    } as any);
    const simulado = new Types.ObjectId();
    await db.collection('simulados').insertOne({
      _id: simulado,
      questoes: [{ questao: questao._id, numero: 1 }],
    });

    const r = await mod.get(SimuladoRepository).answer(String(simulado));

    expect((r.questoes[0].questao as any).frente1.nome).toBe('F');
  });
});
