// ms-simulado/test/categoria-schema-extension.e2e-spec.ts

// Requires a real MongoDB instance (process.env.MONGODB or mongodb://localhost:27017/ms-simulado-test).
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { useContainer } from 'class-validator';
import { AppModule } from '../src/app.module';
import { Categoria } from '../src/modules/categoria/schemas/categoria.schema';

describe('Card 02 — Categoria schema extension + ExameSeedService (e2e)', () => {
  let app: INestApplication;
  let categoriaModel: Model<Categoria>;
  let exameId: string;
  let createdCategoriaId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB =
      process.env.MONGODB ?? 'mongodb://localhost:27017/ms-simulado-test';
    process.env.QUEUE_DRIVER = 'memory';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
    useContainer(app.select(AppModule), { fallbackOnErrors: true });

    categoriaModel = moduleFixture.get<Model<Categoria>>(
      getModelToken(Categoria.name),
    );

    // ExameSeedService roda no OnModuleInit durante app.init()
    const exameModel = moduleFixture.get<Model<any>>(getModelToken('Exame'));
    const personalizado = await exameModel.findOne({ nome: 'Personalizado' });
    exameId = personalizado?._id.toString();
  });

  afterAll(async () => {
    if (createdCategoriaId) {
      await categoriaModel.deleteOne({ _id: createdCategoriaId });
    }
    await app.close();
  });

  it('1. ExameSeedService cria Exame "Personalizado" no init do app', () => {
    expect(exameId).toBeDefined();
  });

  it('2. Exame "Personalizado" não é duplicado em reinicializações', async () => {
    const exameModel = app.get<Model<any>>(getModelToken('Exame'));
    const count = await exameModel.countDocuments({ nome: 'Personalizado' });
    expect(count).toBe(1);
  });

  it('3. POST /v1/categoria aceita os 4 campos novos e retorna 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/categoria')
      .send({
        nome: 'Categoria E2E Card02',
        duracao: 120,
        exame: exameId,
        custom: false,
        selecionavel: true,
        descricao: 'descricao de teste',
      });

    expect(res.status).toBe(201);
    expect(res.body.custom).toBe(false);
    expect(res.body.selecionavel).toBe(true);
    expect(res.body.descricao).toBe('descricao de teste');
    expect(res.body.quantidadeTotalQuestao).toBeNull();
    createdCategoriaId = res.body._id;
  });

  it('4. GET /v1/categoria retorna exame como objeto populado (não ObjectId)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/categoria')
      .query({ page: 1, limit: 100 });

    expect(res.status).toBe(200);
    const created = res.body.data.find(
      (c: any) => c._id === createdCategoriaId,
    );
    expect(created).toBeDefined();
    expect(typeof created.exame).toBe('object');
    expect(created.exame.nome).toBe('Personalizado');
  });

  it('5. GET /v1/categoria/:id retorna exame como objeto populado', async () => {
    const res = await request(app.getHttpServer()).get(
      `/v1/categoria/${createdCategoriaId}`,
    );

    expect(res.status).toBe(200);
    expect(typeof res.body.exame).toBe('object');
    expect(res.body.exame.nome).toBe('Personalizado');
  });
});
