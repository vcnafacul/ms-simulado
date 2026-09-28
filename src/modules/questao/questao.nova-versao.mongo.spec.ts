import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { Status } from './enums/status.enum';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';

/**
 * Nova versão respeita `receberNovasVersoes` (tickets/023, card 06) — contra
 * o Mongo real, porque a regra depende do que está GRAVADO nas provas (a
 * migração 0004 existe por isso) e do `$nin` nos simulados.
 */
describe('substituirQuestao com receberNovasVersoes — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
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
    simulados = mod.get(getModelToken(Simulado.name));
    questoes = mod.get(getModelToken(Questao.name));
    repo = mod.get(QuestaoRepository);
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const oid = () => new Types.ObjectId();
  const q = async (status = Status.Approved) =>
    (await questoes.collection.insertOne({ status } as never)).insertedId;
  const sim = async (questao: Types.ObjectId) =>
    (
      await simulados.collection.insertOne({
        nome: 's',
        questoes: [{ questao, numero: 7 }],
      } as never)
    ).insertedId;
  /** Gravada crua: `receber` undefined = prova sem o campo. */
  const prova = async (
    questao: Types.ObjectId,
    sims: Types.ObjectId[],
    receber?: boolean,
  ) =>
    (
      await provas.collection.insertOne({
        nome: 'p',
        questoes: [{ questao, numero: 7 }],
        simulados: sims,
        totalQuestaoValidadas: 1,
        ...(receber === undefined ? {} : { receberNovasVersoes: receber }),
      } as never)
    ).insertedId;
  const ptr = async (m: Model<any>, id: Types.ObjectId) =>
    String((await m.collection.findOne({ _id: id }))!.questoes[0].questao);
  const numero = async (m: Model<any>, id: Types.ObjectId) =>
    (await m.collection.findOne({ _id: id }))!.questoes[0].numero;

  it('⚠️ A (false) mantém, B (true) recebe — prova e simulados', async () => {
    const Q = await q();
    const Q2 = await q(Status.Pending);
    const sA = await sim(Q);
    const sB = await sim(Q);
    const A = await prova(Q, [sA], false);
    const B = await prova(Q, [sB], true);

    const r = await repo.substituirQuestao(String(Q), String(Q2));

    expect(await ptr(provas, A)).toBe(String(Q));
    expect(await ptr(simulados, sA)).toBe(String(Q));
    expect(await ptr(provas, B)).toBe(String(Q2));
    expect(await ptr(simulados, sB)).toBe(String(Q2));
    // no lugar: o número não muda
    expect(await numero(provas, B)).toBe(7);
    expect(await numero(simulados, sB)).toBe(7);
    expect(r).toMatchObject({
      provas: [String(B)],
      provasMantidas: [String(A)],
      simulados: 1,
      simuladosMantidos: 1,
    });
  });

  it('todas false → nenhuma troca', async () => {
    const Q = await q();
    const s = await sim(Q);
    const A = await prova(Q, [s], false);

    const r = await repo.substituirQuestao(String(Q), String(oid()));

    expect(await ptr(provas, A)).toBe(String(Q));
    expect(await ptr(simulados, s)).toBe(String(Q));
    expect(r.provas).toEqual([]);
    expect(r.simulados).toBe(0);
  });

  it('simulado sem prova com a questão → troca (sem regressão)', async () => {
    const Q = await q();
    const solto = await sim(Q);
    const Q2 = oid();

    await repo.substituirQuestao(String(Q), String(Q2));

    expect(await ptr(simulados, solto)).toBe(String(Q2));
  });

  it('⚠️ simulado ligado a uma prova false E a uma true → NÃO troca (a trava vence)', async () => {
    const Q = await q();
    const s = await sim(Q);
    await prova(Q, [s], false);
    const B = await prova(Q, [s], true);
    const Q2 = oid();

    await repo.substituirQuestao(String(Q), String(Q2));

    expect(await ptr(simulados, s)).toBe(String(Q));
    expect(await ptr(provas, B)).toBe(String(Q2));
  });

  it('⚠️ prova SEM o campo não recebe — por isso a migração 0004 vem antes', async () => {
    const Q = await q();
    const legada = await prova(Q, [], undefined);
    const Q2 = oid();

    const r = await repo.substituirQuestao(String(Q), String(Q2));

    expect(await ptr(provas, legada)).toBe(String(Q));
    expect(r.provasMantidas).toEqual([String(legada)]);
  });

  it('recalcularTotalValidadas: B cai para 0 (sucessora Pending); A intacta', async () => {
    const Q = await q(Status.Approved);
    const Q2 = await q(Status.Pending);
    const A = await prova(Q, [], false);
    const B = await prova(Q, [], true);

    const r = await repo.substituirQuestao(String(Q), String(Q2));
    await repo.recalcularTotalValidadas(r.provas);

    const total = async (id: Types.ObjectId) =>
      (await provas.collection.findOne({ _id: id }))!.totalQuestaoValidadas;
    expect(await total(B)).toBe(0);
    expect(await total(A)).toBe(1);
  });
});
