import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  Simulado,
  SimuladoSchema,
} from 'src/modules/simulado/schemas/simulado.schema';
import { Period } from 'src/shared/enum/period';
import { HistoricoStatus } from '../enums/historico-status.enum';
import { HistoricoRepository } from '../historico.repository';
import { Historico, HistoricoSchema } from '../historico.schema';
import { MonitoramentoHistoricoService } from './monitoramento-historico.service';
import { SimuladosDoCursinhoRepository } from './simulados-do-cursinho.repository';

/**
 * tickets/044, card 04 — simulados do cursinho no Monitoramento. Mongo real: o
 * recorte é `$match` em pipeline, e o `simulado` do histórico pode estar em texto.
 *
 * ⚠️ Banco próprio (`dbName`): no CI o `MONGODB_TEST_URI` é um Mongo só para a
 * suíte inteira, e outros specs deixam históricos lá — a contagem sem filtro
 * deste arquivo dava 8 em vez de 5 (ms#289).
 */
describe('MonitoramentoHistoricoService (044/04) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let service: MonitoramentoHistoricoService;
  let repo: HistoricoRepository;
  let histModel: Model<Historico>;
  let simModel: Model<Simulado>;

  const EM_MARCO = new Date('2026-03-10T12:00:00.000Z');
  const CURSINHO_A = 'cursinho-a';
  const CURSINHO_B = 'cursinho-b';

  const simA = new Types.ObjectId();
  const simA2 = new Types.ObjectId();
  const simB = new Types.ObjectId();
  const simPlataforma = new Types.ObjectId();

  /** `_id` em março (o agregado tira a data do `_id`), um diferente por documento. */
  let seq = 0;
  function idEmMarco() {
    const segundos = Math.floor(EM_MARCO.getTime() / 1000).toString(16);
    return new Types.ObjectId(
      segundos + (++seq).toString(16).padStart(16, '0'),
    );
  }

  function historico(simulado: unknown, status = HistoricoStatus.Completed) {
    return {
      _id: idEmMarco(),
      usuario: 'u',
      ano: 2026,
      simulado,
      status,
      respostas: [{ questao: new Types.ObjectId() }],
    };
  }

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `monitoramento-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
        ]),
      ],
      providers: [
        HistoricoRepository,
        SimuladosDoCursinhoRepository,
        MonitoramentoHistoricoService,
      ],
    }).compile();

    service = mod.get(MonitoramentoHistoricoService);
    repo = mod.get(HistoricoRepository);
    histModel = mod.get(getModelToken(Historico.name));
    simModel = mod.get(getModelToken(Simulado.name));

    await simModel.collection.insertMany([
      { _id: simA, nome: 'A1', cursinhoId: CURSINHO_A, questoes: [] },
      { _id: simA2, nome: 'A2', cursinhoId: CURSINHO_A, questoes: [] },
      { _id: simB, nome: 'B1', cursinhoId: CURSINHO_B, questoes: [] },
      { _id: simPlataforma, nome: 'ENEM', cursinhoId: null, questoes: [] },
    ]);
    await histModel.collection.insertMany([
      historico(simA),
      historico(simA, HistoricoStatus.Pending),
      // ⚠️ id do simulado gravado em texto (Mixed): tem de contar
      historico(simA2.toString()),
      historico(simB),
      historico(simPlataforma),
    ]);
  }, 60000);

  afterAll(async () => {
    await histModel?.db.dropDatabase();
    await mod?.close();
    await mongo?.stop();
  });

  it('resumo conta só os simulados do cursinho, nos dois formatos de id', async () => {
    expect(await service.resumo(CURSINHO_A)).toEqual({
      historicTotal: 3,
      historicCompleted: 2,
    });
    expect(await service.resumo(CURSINHO_B)).toEqual({
      historicTotal: 1,
      historicCompleted: 1,
    });
  });

  it('cursinho sem simulado → zeros', async () => {
    expect(await service.resumo('sem-simulado')).toEqual({
      historicTotal: 0,
      historicCompleted: 0,
    });
  });

  it('por período recorta pelo cursinho', async () => {
    const serie = await service.porPeriodo(CURSINHO_A, Period.month);
    const marco = serie.find((p) => p.period === '2026-03');
    expect(marco).toMatchObject({ total: 3, completos: 2, incompletos: 1 });
  });

  it('por tipo recorta pelo cursinho', async () => {
    const serie = await service.porTipo(CURSINHO_A, Period.month);
    const total = serie
      .flatMap((t) => t.summary)
      .filter((s) => s.period === '2026-03')
      .reduce((acc, s) => acc + s.total, 0);
    expect(total).toBe(3);
  });

  it('sem filtro, os contadores da plataforma não mudam', async () => {
    expect(await repo.getTotalEntity()).toBe(5);
    expect(await repo.entityCompleted()).toBe(4);
  });
});
