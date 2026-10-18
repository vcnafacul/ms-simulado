import { BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ClientSession, Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../../historico/historico.schema';
import { Prova, ProvaSchema } from '../../prova/prova.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { MotivoAnulacao } from '../enums/motivo-anulacao.enum';
import { Status } from '../enums/status.enum';
import { QuestaoRepository } from '../questao.repository';
import { Questao, QuestaoSchema } from '../questao.schema';
import { QuestaoService } from '../questao.service';
import { AnulacaoRepository } from './anulacao.repository';

/**
 * tickets/042, card 04 — o aviso ao adicionar (D4), o filtro do banco e o
 * espelho que acompanha a nova versão. Mongo real; a fábrica é um dublê que
 * escreve o slot como as de verdade e chama o gancho da transação.
 */
describe('adicionar questão anulada (042/04) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
  let questoes: Model<Questao>;
  let anulacoes: AnulacaoRepository;
  let questaoRepo: QuestaoRepository;
  let service: QuestaoService;
  const audit = { create: jest.fn() };

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `aviso-${Date.now()}` }),
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
    anulacoes = mod.get(AnulacaoRepository);
    questaoRepo = mod.get(QuestaoRepository);

    // A fábrica de verdade: slot na prova e nos simulados dela, gancho antes
    // do commit. Aqui, sem transação (standalone).
    const fabrica = {
      verifyNumberProva: async () => true,
      addQuestaoExistenteAProva: async (
        questaoId: string,
        provaId: string,
        numero: number,
        dentro?: (s: ClientSession) => Promise<void>,
      ) => {
        const slot = { questao: new Types.ObjectId(questaoId), numero };
        await provas.collection.updateOne(
          { _id: new Types.ObjectId(provaId) },
          { $push: { questoes: slot } as never },
        );
        const p = await provas.collection.findOne({
          _id: new Types.ObjectId(provaId),
        });
        await simulados.collection.updateMany(
          { _id: { $in: p!.simulados } },
          { $push: { questoes: slot } as never },
        );
        if (dentro) await dentro(undefined as never);
      },
    };
    const provaRepositoryDuble = {
      getById: async (id: string): Promise<unknown> =>
        provas
          .findById(id)
          .lean()
          .then((p) => p && { ...p, categoria: {} }),
    };
    service = new QuestaoService(
      questaoRepo,
      { assertPodeComporProva: async (): Promise<void> => undefined } as never,
      provaRepositoryDuble as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      { getFactory: () => fabrica } as never,
      undefined,
      anulacoes,
    );
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(() => audit.create.mockClear());

  const justificativa = 'A alternativa C, dada como gabarito, está errada.';
  const anulacao = {
    motivo: MotivoAnulacao.semAlternativaCorreta,
    justificativa,
    em: new Date('2026-10-01T00:00:00Z'),
    porUsuarioId: 'u',
    porCursinhoId: null as string | null,
  };

  async function prova(
    nome: string,
    itens: { questao: Types.ObjectId; numero: number }[] = [],
  ) {
    const s = (
      await simulados.collection.insertOne({ questoes: itens } as never)
    ).insertedId;
    const p = (
      await provas.collection.insertOne({
        nome,
        questoes: itens,
        simulados: [s],
      } as never)
    ).insertedId;
    return { p, s };
  }

  /** Q anulada na 45 de "ENEM 2022 – Dia 2"; e uma prova de destino vazia. */
  async function cenario() {
    const Q = (
      await questoes.collection.insertOne({ status: Status.Approved } as never)
    ).insertedId;
    const origem = await prova('ENEM 2022 – Dia 2', [
      { questao: Q, numero: 45 },
    ]);
    await anulacoes.gravar(
      { provaId: String(origem.p), questaoId: String(Q), subirRevisao: true },
      anulacao,
    );
    const destino = await prova('Simulado 3 – Cursinho X');
    return { Q, origem, destino };
  }

  const slotDe = async (m: Model<any>, id: Types.ObjectId) =>
    (await m.collection.findOne({ _id: id }))!.questoes[0];

  it('⚠️ sem `modo`, questão anulada → 409 QUESTAO_ANULADA com prova, número e justificativa; nada é escrito', async () => {
    const { Q, destino } = await cenario();
    const erro = await service
      .adicionarEmProva(String(Q), String(destino.p), 12)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({
      code: 'QUESTAO_ANULADA',
      anulacoes: [
        {
          provaNome: 'ENEM 2022 – Dia 2',
          numero: 45,
          motivo: 'sem_alternativa_correta',
          justificativa,
        },
      ],
    });
    expect(
      (await provas.collection.findOne({ _id: destino.p }))!.questoes,
    ).toEqual([]);
  });

  it('`modo: normal` → entra válida, e a auditoria registra as anulações existentes', async () => {
    const { Q, destino } = await cenario();
    await service.adicionarEmProva(
      String(Q),
      String(destino.p),
      12,
      'u',
      undefined,
      {
        modo: 'normal',
      },
    );
    expect((await slotDe(provas, destino.p)).anulacao).toBeUndefined();
    expect(JSON.parse(audit.create.mock.calls[0][0].changes)).toMatchObject({
      modo: 'normal',
      anulacoesExistentes: 1,
    });
  });

  it('`modo: anulada` → slot anulado na prova e no simulado; espelho com as duas; revisão não sobe', async () => {
    const { Q, destino } = await cenario();
    await service.adicionarEmProva(
      String(Q),
      String(destino.p),
      12,
      'u',
      undefined,
      {
        modo: 'anulada',
        anulacao: {
          motivo: MotivoAnulacao.outro,
          justificativa: 'Mesmo erro do ENEM 2022.',
        },
      },
    );
    expect((await slotDe(provas, destino.p)).anulacao).toMatchObject({
      motivo: 'outro',
    });
    expect((await slotDe(simulados, destino.s)).anulacao).toMatchObject({
      motivo: 'outro',
    });
    expect(
      (await simulados.collection.findOne({ _id: destino.s }))!.revisaoAnulacao,
    ).toBeUndefined();
    const espelho = (await questoes.collection.findOne({ _id: Q }))!.anulacoes;
    expect(espelho.map((a: any) => [a.provaId, a.numero]).sort()).toEqual(
      [
        [String(destino.p), 12],
        [espelho.find((a: any) => a.numero === 45).provaId, 45],
      ].sort(),
    );
  });

  it('`modo: anulada` sem justificativa → 400', async () => {
    const { Q, destino } = await cenario();
    await expect(
      service.adicionarEmProva(
        String(Q),
        String(destino.p),
        12,
        'u',
        undefined,
        {
          modo: 'anulada',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('questão nunca anulada entra como hoje, sem `modo`', async () => {
    const Q = (await questoes.collection.insertOne({} as never)).insertedId;
    const destino = await prova('Destino');
    await service.adicionarEmProva(String(Q), String(destino.p), 1);
    expect(String((await slotDe(provas, destino.p)).questao)).toBe(String(Q));
  });

  it('GET anulações: prova excluída sai da lista', async () => {
    const { Q, origem } = await cenario();
    expect(await service.anulacoesDaQuestao(String(Q))).toHaveLength(1);
    await provas.collection.updateOne(
      { _id: origem.p },
      { $set: { deleted: true } },
    );
    expect(await service.anulacoesDaQuestao(String(Q))).toEqual([]);
  });

  it('⚠️ nova versão: prova que recebe → espelho vai para a sucessora; prova que mantém → fica na original', async () => {
    const Q = (
      await questoes.collection.insertOne({ status: Status.Approved } as never)
    ).insertedId;
    const recebe = await prova('Recebe', [{ questao: Q, numero: 7 }]);
    const mantem = await prova('Mantém', [{ questao: Q, numero: 9 }]);
    await provas.collection.updateOne(
      { _id: recebe.p },
      { $set: { receberNovasVersoes: true } },
    );
    for (const x of [recebe, mantem]) {
      await anulacoes.gravar(
        { provaId: String(x.p), questaoId: String(Q), subirRevisao: true },
        anulacao,
      );
    }
    const Q2 = (
      await questoes.collection.insertOne({ status: Status.Pending } as never)
    ).insertedId;

    await questaoRepo.substituirQuestao(String(Q), String(Q2));

    const de = (await questoes.collection.findOne({ _id: Q }))!.anulacoes;
    const para = (await questoes.collection.findOne({ _id: Q2 }))!.anulacoes;
    expect(de.map((a: any) => a.provaId)).toEqual([String(mantem.p)]);
    expect(para.map((a: any) => a.provaId)).toEqual([String(recebe.p)]);
    // O slot da prova que recebeu continua anulado, agora com a sucessora.
    const slot = await slotDe(provas, recebe.p);
    expect(String(slot.questao)).toBe(String(Q2));
    expect(slot.anulacao).toBeDefined();
  });

  it('aplicar versão (trocarNaProva) também move o espelho daquela prova', async () => {
    const Q = (await questoes.collection.insertOne({} as never)).insertedId;
    const x = await prova('X', [{ questao: Q, numero: 3 }]);
    await anulacoes.gravar(
      { provaId: String(x.p), questaoId: String(Q), subirRevisao: true },
      anulacao,
    );
    const Q2 = (await questoes.collection.insertOne({} as never)).insertedId;

    await questaoRepo.trocarNaProva(String(x.p), [x.s], String(Q), String(Q2));

    expect((await questoes.collection.findOne({ _id: Q }))!.anulacoes).toEqual(
      [],
    );
    expect(
      (await questoes.collection.findOne({ _id: Q2 }))!.anulacoes,
    ).toHaveLength(1);
  });

  it('banco: selo + filtro esconder/somente', async () => {
    const { Q } = await cenario();
    const limpa = (await questoes.collection.insertOne({} as never)).insertedId;
    const ids = [String(Q), String(limpa)];
    const ver = async (anulada?: 'todas' | 'esconder' | 'somente') =>
      (
        await service.getAll({ page: 1, limit: 100, anulada } as never)
      ).data.filter((q) => ids.includes(String(q._id)));

    expect((await ver('somente')).map((q) => String(q._id))).toEqual([
      String(Q),
    ]);
    expect((await ver('esconder')).map((q) => String(q._id))).toEqual([
      String(limpa),
    ]);
    const todas = await ver();
    expect(todas.find((q) => String(q._id) === String(Q))).toMatchObject({
      anulada: true,
      qtdAnulacoes: 1,
    });
    expect(todas.find((q) => String(q._id) === String(limpa))).toMatchObject({
      anulada: false,
      qtdAnulacoes: 0,
    });
  });
});
