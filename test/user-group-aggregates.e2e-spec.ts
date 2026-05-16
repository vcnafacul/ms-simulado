// Requires a real MongoDB instance (process.env.MONGODB or mongodb://localhost:27017/ms-simulado-test).
// In CI, ensure a MongoDB service is running (e.g., via docker-compose or GitHub Actions service).
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { UserGroupAggregate } from '../src/modules/user-group-aggregates/user-group-aggregate.schema';

const GROUP_ID = 'e2e-test-group-' + Date.now();
const GROUP_TYPE = 'class';
const MONTH = '2026-05';
const MONTH_START = '2026-05-01T00:00:00.000Z';
const MONTH_END = '2026-05-31T23:59:59.999Z';
const USER_IDS = ['user-e2e-1', 'user-e2e-2'];

describe('UserGroupAggregates (e2e)', () => {
  let app: INestApplication;
  let aggModel: Model<UserGroupAggregate>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB = process.env.MONGODB ?? 'mongodb://localhost:27017/ms-simulado-test';
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

    aggModel = moduleFixture.get<Model<UserGroupAggregate>>(
      getModelToken(UserGroupAggregate.name),
    );
  });

  afterAll(async () => {
    // Clean up test documents created during the suite
    await aggModel.deleteMany({ groupId: GROUP_ID });
    await app.close();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: GET list with no docs → 200 empty array
  // -------------------------------------------------------------------------
  it('1. GET /v1/user-group-aggregates with no docs returns 200 and empty array', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/user-group-aggregates')
      .query({ groupId: GROUP_ID, groupType: GROUP_TYPE });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: GET by-month with no doc → 404
  // -------------------------------------------------------------------------
  it('2. GET /v1/user-group-aggregates/by-month with no doc returns 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/user-group-aggregates/by-month')
      .query({ groupId: GROUP_ID, groupType: GROUP_TYPE, month: MONTH });

    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: POST calculate with empty userIds → 400
  // -------------------------------------------------------------------------
  it('3. POST /v1/user-group-aggregates/calculate with empty userIds returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/user-group-aggregates/calculate')
      .send({
        groupId: GROUP_ID,
        groupType: GROUP_TYPE,
        month: MONTH,
        monthStart: MONTH_START,
        monthEnd: MONTH_END,
        userIds: [],
      });

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: POST calculate with valid input but no historicos → 200 zeroed
  // -------------------------------------------------------------------------
  it('4. POST /v1/user-group-aggregates/calculate with valid input and 0 historicos returns zeroed payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/user-group-aggregates/calculate')
      .send({
        groupId: GROUP_ID,
        groupType: GROUP_TYPE,
        month: MONTH,
        monthStart: MONTH_START,
        monthEnd: MONTH_END,
        userIds: USER_IDS,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      groupId: GROUP_ID,
      groupType: GROUP_TYPE,
      month: MONTH,
    });
    expect(res.body.payload).toMatchObject({
      geral: 0,
      totalAttempts: 0,
      totalAttemptsCompleted: 0,
      studentsWithAtLeastOneCompletedAttempt: 0,
      materias: [],
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: POST calculate called twice → upsert, no error, generatedAt updates
  // -------------------------------------------------------------------------
  it('5. POST /v1/user-group-aggregates/calculate called twice upserts without error', async () => {
    const payload = {
      groupId: GROUP_ID,
      groupType: GROUP_TYPE,
      month: MONTH,
      monthStart: MONTH_START,
      monthEnd: MONTH_END,
      userIds: USER_IDS,
    };

    const res1 = await request(app.getHttpServer())
      .post('/v1/user-group-aggregates/calculate')
      .send(payload);
    expect(res1.status).toBe(201);

    // Small delay so generatedAt can differ
    await new Promise((r) => setTimeout(r, 10));

    const res2 = await request(app.getHttpServer())
      .post('/v1/user-group-aggregates/calculate')
      .send(payload);
    expect(res2.status).toBe(201);

    // Both responses share the same groupId/groupType/month (upsert, not duplicate)
    expect(res1.body.groupId).toBe(res2.body.groupId);
    expect(res1.body.groupType).toBe(res2.body.groupType);
    expect(res1.body.month).toBe(res2.body.month);

    // Verify only one document exists in the DB
    const count = await aggModel.countDocuments({
      groupId: GROUP_ID,
      groupType: GROUP_TYPE,
      month: MONTH,
    });
    expect(count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: GET list after calculate → 200, array with 1 item
  // -------------------------------------------------------------------------
  it('6. GET /v1/user-group-aggregates after calculate returns 200 with 1 item', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/user-group-aggregates')
      .query({ groupId: GROUP_ID, groupType: GROUP_TYPE });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      groupId: GROUP_ID,
      groupType: GROUP_TYPE,
      month: MONTH,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 7: GET by-month after calculate → 200, full doc
  // -------------------------------------------------------------------------
  it('7. GET /v1/user-group-aggregates/by-month after calculate returns 200 with full doc', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/user-group-aggregates/by-month')
      .query({ groupId: GROUP_ID, groupType: GROUP_TYPE, month: MONTH });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      groupId: GROUP_ID,
      groupType: GROUP_TYPE,
      month: MONTH,
    });
    expect(res.body.payload).toBeDefined();
    expect(typeof res.body.payload.geral).toBe('number');
    expect(Array.isArray(res.body.payload.materias)).toBe(true);
  });
});
