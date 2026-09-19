import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

const SIM_A = new Types.ObjectId();
const SIM_B = new Types.ObjectId();

describe('RelatorioSimuladoEstudante — isolamento (Mongo real em memória)', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let uri: string;
  let repo: RelatorioSimuladoEstudanteRepository;
  let relModel: Model<RelatorioSimuladoEstudante>;
  let histModel: Model<Historico>;

  beforeAll(async () => {
    // O CI já sobe um `mongo:7` como service container (ci-homol.yml) — usar
    // esse em vez de baixar +141MB de `mongod` do `mongodb-memory-server` a
    // cada run. Localmente, sem a env var, cai no memory server de sempre.
    uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          {
            name: RelatorioSimuladoEstudante.name,
            schema: RelatorioSimuladoEstudanteSchema,
          },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [RelatorioSimuladoEstudanteRepository],
    }).compile();

    repo = mod.get(RelatorioSimuladoEstudanteRepository);
    relModel = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    histModel = mod.get(getModelToken(Historico.name));

    const semear = async (
      simulado: Types.ObjectId,
      cursinhoId: string,
      usuario: string,
      turmaId?: string,
      extra: Partial<Pick<Historico, 'cartaoCode' | 'falha'>> = {},
    ) => {
      const h = await histModel.create({
        usuario,
        simulado,
        status: 'completed',
        questoesRespondidas: 90,
        aproveitamento: { geral: 0.5, materias: [] },
        ...extra,
      });
      await relModel.create({
        historico: h._id,
        simulado,
        usuario,
        cursinhoId,
        turmaId,
      });
    };

    // cartaoCode e falha só em u-a1: é o histórico que o teste do `select`
    // (linha ~140) usa para provar os 5 campos, não só 3.
    await semear(SIM_A, 'cur-1', 'u-a1', 't-1', {
      cartaoCode: '42',
      falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
    });
    await semear(SIM_A, 'cur-1', 'u-a2', 't-2');
    await semear(SIM_A, 'cur-1', 'u-a3'); // sem turma
    await semear(SIM_A, 'cur-2', 'u-b1', 't-9'); // outro cursinho
    await semear(SIM_B, 'cur-1', 'u-c1', 't-1'); // outro simulado
  }, 120_000);

  afterAll(async () => {
    await mod.close();
    // só para quem a gente subiu — o `mongo:7` do CI é do CI, não nosso
    if (mongo) {
      await mongo.stop();
    }
  });

  it('não vaza entre cursinhos', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2', 'u-a3']);
  });

  it('não vaza entre simulados', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_B.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-c1']);
  });

  it('turmaId restringe à turma', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-a1']);
  });

  it('sem turmaId, vêm TODOS: com turma e sem turma', async () => {
    // reintroduzir o bug faz esta asserção cair: o filtro {turmaId: null}
    // devolveria só 'u-a3'
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    const comTurma = r.filter((l) => l.turmaId !== undefined);
    const semTurma = r.filter((l) => l.turmaId === undefined);
    expect(comTurma.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2']);
    expect(semTurma.map((l) => l.usuario)).toEqual(['u-a3']);
  });

  it('o populate traz o histórico, com os campos certos e sem as respostas', async () => {
    // o `select` é uma string: um typo nele passa em todo teste com dublê.
    // As 5 asserções de campo cobrem os 5 nomes de CAMPOS_DO_HISTORICO —
    // mutar o select para tirar `cartaoCode` ou `falha` tem que deixar
    // exatamente uma delas vermelha.
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r[0].historico.status).toBe('completed');
    expect(r[0].historico.cartaoCode).toBe('42');
    expect(r[0].historico.questoesRespondidas).toBe(90);
    expect(r[0].historico.aproveitamento.geral).toBe(0.5);
    expect(r[0].historico.falha).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'sem CSV',
    });
    expect((r[0].historico as any).respostas).toBeUndefined();
  });

  it('vem ordenado por usuário, não na ordem natural do Mongo', async () => {
    // insere fora de ordem alfabética num simulado só desta linha, pra não
    // depender da ordem de inserção do `beforeAll` coincidir com a esperada
    const SIM_ORDEM = new Types.ObjectId();
    for (const usuario of ['u-zebra', 'u-abacate', 'u-melancia']) {
      const h = await histModel.create({
        usuario,
        simulado: SIM_ORDEM,
        status: 'completed',
      });
      await relModel.create({
        historico: h._id,
        simulado: SIM_ORDEM,
        usuario,
        cursinhoId: 'cur-1',
      });
    }

    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_ORDEM.toString(),
      cursinhoId: 'cur-1',
    });

    expect(r.map((l) => l.usuario)).toEqual([
      'u-abacate',
      'u-melancia',
      'u-zebra',
    ]);
  });

  it('a contagem é do cursinho, não global', async () => {
    // cur-2 também tem cartão em SIM_A; ele não pode entrar na conta
    const total = await repo.contarDoCursinho(SIM_A.toString(), 'cur-1');
    expect(total).toBe(3);
  });

  /**
   * Fix 4 da revisão adversarial: o spec do controller usa um dublê do
   * serviço, e os specs acima falam com o repositório direto. Nada até aqui
   * prova o `@Query()` binding, a `ValidationPipe`, a montagem do DTO pelo
   * `whitelist` e a serialização JSON de ponta a ponta — é isso que este
   * bloco cobre, com o MESMO Mongo (real ou em memória) desta suíte.
   */
  describe('HTTP: controller → service → repositório → Mongo', () => {
    let app: INestApplication;
    let httpMod: TestingModule;
    const SIM_HTTP = new Types.ObjectId();

    beforeAll(async () => {
      // histórico completo, com falha — prova `historicoId` string e `falha`
      // descrita na resposta.
      const hComFalha = await histModel.create({
        usuario: 'u-http-falha',
        simulado: SIM_HTTP,
        status: 'failed',
        falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
      });
      await relModel.create({
        historico: hComFalha._id,
        simulado: SIM_HTTP,
        usuario: 'u-http-falha',
        cursinhoId: 'cur-http',
      });

      // histórico NUNCA lido — sem `aproveitamento` nenhum. É o caso que
      // prova que a chave some do JSON, não vira `null`/`0`.
      const hNuncaLido = await histModel.create({
        usuario: 'u-http-nao-lido',
        simulado: SIM_HTTP,
        status: 'awaiting_omr',
      });
      await relModel.create({
        historico: hNuncaLido._id,
        simulado: SIM_HTTP,
        usuario: 'u-http-nao-lido',
        cursinhoId: 'cur-http',
      });

      httpMod = await Test.createTestingModule({
        imports: [
          MongooseModule.forRoot(uri),
          MongooseModule.forFeature([
            {
              name: RelatorioSimuladoEstudante.name,
              schema: RelatorioSimuladoEstudanteSchema,
            },
            { name: Historico.name, schema: HistoricoSchema },
          ]),
        ],
        controllers: [RelatorioSimuladoEstudanteController],
        providers: [
          RelatorioSimuladoEstudanteRepository,
          RelatorioSimuladoEstudanteService,
        ],
      }).compile();

      app = httpMod.createNestApplication();
      // A MESMA pipe que `src/main.ts` registra primeiro — senão o teste
      // prova um comportamento que a app de verdade não tem.
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
        }),
      );
      await app.init();
    }, 120_000);

    afterAll(async () => {
      await app.close();
      await httpMod.close();
    });

    it('200 — historicoId é string, falha vem descrita, e o total do rodapé aparece', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}`)
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      const linhaComFalha = res.body.linhas.find(
        (l: any) => l.usuario === 'u-http-falha',
      );
      expect(typeof linhaComFalha.historicoId).toBe('string');
      expect(linhaComFalha.falha).toEqual(
        expect.objectContaining({
          codigo: 'cartao_nao_detectado',
          descricao: expect.stringContaining(
            'Não foi possível localizar o cartão',
          ),
        }),
      );
      expect(res.body.totalEstudantesComCartaoNoCursinho).toBe(2);
    });

    it('400 — sem cursinhoId, a rota recusa em vez de devolver "todos os cursinhos"', async () => {
      await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}`)
        .expect(400);
    });

    it('400 — :simuladoId que não é ObjectId', async () => {
      // sem a validação (Fix 5), `new Types.ObjectId('nao-e-objectid')` no
      // repositório lança `BSONError` e a rota responde 500
      await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/nao-e-objectid')
        .query({ cursinhoId: 'cur-http' })
        .expect(400);
    });

    it('a chave aproveitamentoGeral SOME do JSON quando o cartão nunca foi lido', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}`)
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      const linhaNaoLida = res.body.linhas.find(
        (l: any) => l.usuario === 'u-http-nao-lido',
      );
      expect('aproveitamentoGeral' in linhaNaoLida).toBe(false);
    });
  });
});
