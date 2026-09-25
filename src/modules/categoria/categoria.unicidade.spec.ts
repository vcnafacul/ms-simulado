import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { CategoriaRepository } from './categoria.repository';
import { Categoria, CategoriaSchema } from './schemas/categoria.schema';

/**
 * Nome de categoria é único DENTRO do dono (QA): o cursinho X não pode ser
 * barrado por uma categoria do Y, e uma excluída não pode barrar a recriação.
 *
 * ⚠️ Mongo real: quem decide é o índice construído — e o que o QA viu só se
 * reproduz com o índice antigo `nome_1` no banco, que o schema não declara mais.
 */
describe('unicidade do nome da categoria — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: CategoriaRepository;
  let model: Model<Categoria>;

  const categoria = (nome: string, dono: string) => ({
    nome,
    dono,
    duracao: 60,
    exame: new Types.ObjectId(),
    custom: true,
    selecionavel: true,
  });

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Categoria.name, schema: CategoriaSchema },
        ]),
      ],
      providers: [CategoriaRepository],
    }).compile();
    repo = mod.get(CategoriaRepository);
    model = mod.get(getModelToken(Categoria.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    await model.syncIndexes();
  });

  it('cursinhos diferentes podem ter o mesmo nome', async () => {
    await model.create(categoria('Semana 1', 'cur-X'));
    await model.create(categoria('Semana 1', 'cur-Y'));

    expect(await model.countDocuments()).toBe(2);
  });

  it('o mesmo cursinho não pode repetir o nome', async () => {
    await model.create(categoria('Semana 1', 'cur-X'));

    await expect(
      model.create(categoria('Semana 1', 'cur-X')),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('⚠️ excluir é DEFINITIVO — e libera o nome para recriar', async () => {
    const criada = await model.create(categoria('Semana 1', 'cur-X'));

    await repo.delete(String(criada._id));

    expect(await model.findById(criada._id)).toBeNull();
    await model.create(categoria('Semana 1', 'cur-X'));
    expect(await model.countDocuments()).toBe(1);
  });

  it('excluir o que não existe é 404', async () => {
    await expect(
      repo.delete(String(new Types.ObjectId())),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('⚠️ DIAGNÓSTICO: com o índice antigo `nome_1` no banco, os dois sintomas do QA aparecem', async () => {
    // O que a migração 0003 remove (passo 4). O `autoIndex` NÃO remove índice
    // que saiu do schema — se a migração não rodou, ele segue valendo.
    await model.collection.createIndex(
      { nome: 1 },
      { unique: true, name: 'nome_1' },
    );
    try {
      await model.create(categoria('Semana 1', 'cur-Y'));

      // 1. outro cursinho é barrado
      await expect(
        model.create(categoria('Semana 1', 'cur-X')),
      ).rejects.toMatchObject({ code: 11000 });

      // 2. uma soft-deletada continuaria barrando a recriação
      await model.updateMany({}, { deleted: true });
      await expect(
        model.create(categoria('Semana 1', 'cur-Y')),
      ).rejects.toMatchObject({ code: 11000 });
    } finally {
      await model.collection.dropIndex('nome_1');
    }
  });
});
