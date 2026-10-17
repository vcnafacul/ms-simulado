import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../../historico/historico.schema';
import { filtroDivergente } from '../../historico/filtro-divergente';
import { Prova, ProvaSchema } from '../../prova/prova.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { calcularBloqueado } from '../../simulado/helpers/bloqueado';
import { MotivoAnulacao } from '../enums/motivo-anulacao.enum';
import { Status } from '../enums/status.enum';
import { QuestaoRepository } from '../questao.repository';
import { Questao, QuestaoSchema } from '../questao.schema';
import { AnulacaoRepository } from './anulacao.repository';

/**
 * tickets/042, card 01 — o slot, os simulados da prova e o espelho, contra o
 * Mongo real. (Standalone: sem transação — a sessão é provada no
 * `anulacao.repository.spec.ts`.)
 */
describe('AnulacaoRepository — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
  let questoes: Model<Questao>;
  let historicos: Model<Historico>;
  let repo: AnulacaoRepository;
  let questaoRepo: QuestaoRepository;

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
      providers: [AnulacaoRepository, QuestaoRepository],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    simulados = mod.get(getModelToken(Simulado.name));
    questoes = mod.get(getModelToken(Questao.name));
    historicos = mod.get(getModelToken(Historico.name));
    repo = mod.get(AnulacaoRepository);
    questaoRepo = mod.get(QuestaoRepository);
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const anulacao = (justificativa = 'A alternativa C está errada.') => ({
    motivo: MotivoAnulacao.semAlternativaCorreta,
    justificativa,
    em: new Date('2026-10-17T12:00:00Z'),
    porUsuarioId: 'u1',
    porCursinhoId: 'c1',
  });

  /** Questão Q no número 45 de uma prova com 2 simulados, e num simulado de OUTRA prova. */
  async function cenario() {
    const Q = (
      await questoes.collection.insertOne({ status: 'approved' } as never)
    ).insertedId;
    const outra = (await questoes.collection.insertOne({} as never)).insertedId;
    const sim = async () =>
      (
        await simulados.collection.insertOne({
          nome: 's',
          questoes: [
            { questao: outra, numero: 44 },
            { questao: Q, numero: 45 },
          ],
        } as never)
      ).insertedId;
    const s1 = await sim();
    const s2 = await sim();
    const sAlheio = await sim();
    const P = (
      await provas.collection.insertOne({
        nome: 'P',
        questoes: [
          { questao: outra, numero: 44 },
          { questao: Q, numero: 45 },
        ],
        simulados: [s1, s2],
      } as never)
    ).insertedId;
    return { Q, P, s1, s2, sAlheio };
  }

  const slot = async (m: Model<any>, id: Types.ObjectId, n = 45) =>
    (await m.collection.findOne({ _id: id }))!.questoes.find(
      (qc: { numero: number }) => qc.numero === n,
    );
  const doc = async (m: Model<any>, id: Types.ObjectId) =>
    (await m.collection.findOne({ _id: id }))!;

  it('documento antigo lê como "nenhuma anulada, revisão 0"', async () => {
    const { Q, P, s1 } = await cenario();
    const prova = await provas.findById(P).lean();
    expect(prova!.questoes[1].anulacao).toBeUndefined();
    const sim = await simulados.findById(s1).lean();
    expect(sim!.revisaoAnulacao ?? 0).toBe(0);
    const q = await questoes.findById(Q).lean();
    expect(q!.anulacoes ?? []).toEqual([]);
  });

  it('anular: slot da prova e dos DOIS simulados dela, espelho, revisão +1 — e só eles', async () => {
    const { Q, P, s1, s2, sAlheio } = await cenario();

    const r = await repo.gravar(
      { provaId: String(P), questaoId: String(Q), subirRevisao: true },
      anulacao(),
    );

    expect(r).toEqual({ numero: 45, simuladoIds: [String(s1), String(s2)] });
    for (const [m, id] of [
      [provas, P],
      [simulados, s1],
      [simulados, s2],
    ] as const) {
      expect((await slot(m, id)).anulacao).toMatchObject({
        motivo: 'sem_alternativa_correta',
      });
      // A vizinha não é tocada.
      expect((await slot(m, id, 44)).anulacao).toBeUndefined();
    }
    expect((await slot(simulados, sAlheio)).anulacao).toBeUndefined();
    expect((await doc(simulados, s1)).revisaoAnulacao).toBe(1);
    expect((await doc(simulados, sAlheio)).revisaoAnulacao).toBeUndefined();
    expect((await doc(questoes, Q)).anulacoes).toEqual([
      expect.objectContaining({ provaId: String(P), numero: 45 }),
    ]);
  });

  it('editar a justificativa não sobe a revisão nem duplica o espelho', async () => {
    const { Q, P, s1 } = await cenario();
    const e = { provaId: String(P), questaoId: String(Q) };
    await repo.gravar({ ...e, subirRevisao: true }, anulacao());
    await repo.gravar({ ...e, subirRevisao: false }, anulacao('Texto novo.'));

    expect((await doc(simulados, s1)).revisaoAnulacao).toBe(1);
    const espelho = (await doc(questoes, Q)).anulacoes;
    expect(espelho).toHaveLength(1);
    expect(espelho[0].justificativa).toBe('Texto novo.');
  });

  it('desanular: limpa slot e espelho, e sobe a revisão de novo', async () => {
    const { Q, P, s1 } = await cenario();
    const e = { provaId: String(P), questaoId: String(Q), subirRevisao: true };
    await repo.gravar(e, anulacao());
    await repo.limpar(e);
    await repo.gravar(e, anulacao());

    expect((await doc(simulados, s1)).revisaoAnulacao).toBe(3);
    await repo.limpar(e);
    expect((await slot(provas, P)).anulacao).toBeUndefined();
    expect((await slot(simulados, s1)).anulacao).toBeUndefined();
    expect((await doc(questoes, Q)).anulacoes).toEqual([]);
  });

  it('questão fora da prova → 404, e nada é escrito', async () => {
    const { P, s1 } = await cenario();
    const fora = new Types.ObjectId();
    await expect(
      repo.gravar(
        { provaId: String(P), questaoId: String(fora), subirRevisao: true },
        anulacao(),
      ),
    ).rejects.toThrow('não está nesta prova');
    expect((await doc(simulados, s1)).revisaoAnulacao).toBeUndefined();
  });

  it('⚠️ nova versão troca só o ponteiro: a anulação fica no slot (A11)', async () => {
    const { Q, P, s1 } = await cenario();
    await provas.collection.updateOne(
      { _id: P },
      { $set: { receberNovasVersoes: true } },
    );
    await repo.gravar(
      { provaId: String(P), questaoId: String(Q), subirRevisao: true },
      anulacao(),
    );
    const Q2 = (
      await questoes.collection.insertOne({ status: Status.Pending } as never)
    ).insertedId;

    await questaoRepo.substituirQuestao(String(Q), String(Q2));

    for (const [m, id] of [
      [provas, P],
      [simulados, s1],
    ] as const) {
      const s = await slot(m, id);
      expect(String(s.questao)).toBe(String(Q2));
      expect(s.anulacao).toMatchObject({ motivo: 'sem_alternativa_correta' });
    }
  });

  it('simulado com anulada continua liberado com as 90 (R1)', async () => {
    const questoes90 = Array.from({ length: 90 }, (_, i) => ({
      questao: { _id: new Types.ObjectId(), status: Status.Approved },
      numero: i + 1,
      ...(i === 44 ? { anulacao: anulacao() } : {}),
    }));
    expect(
      calcularBloqueado({
        categoria: { quantidadeTotalQuestao: 90 },
        questoes: questoes90 as never,
      }),
    ).toBe(false);
  });

  it('⚠️ filtroDivergente casa histórico SEM o campo e com revisão menor', async () => {
    const simulado = new Types.ObjectId();
    await historicos.collection.insertMany([
      { simulado, usuario: 'sem-campo' },
      { simulado, usuario: 'zero', revisaoAnulacao: 0 },
      { simulado, usuario: 'atual', revisaoAnulacao: 1 },
      { simulado, usuario: 'futuro', revisaoAnulacao: 2 },
    ] as never);

    const achados = await historicos.collection
      .find({ simulado, ...filtroDivergente(1) })
      .toArray();
    expect(achados.map((h) => h.usuario).sort()).toEqual(['sem-campo', 'zero']);

    // O motivo do helper: `$lt` perde o documento sem o campo.
    const comLt = await historicos.collection
      .find({ simulado, revisaoAnulacao: { $lt: 1 } })
      .toArray();
    expect(comLt.map((h) => h.usuario)).toEqual(['zero']);
  });
});
