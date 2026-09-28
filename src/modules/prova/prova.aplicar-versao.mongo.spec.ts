import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import {
  Categoria,
  CategoriaSchema,
} from '../categoria/schemas/categoria.schema';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Status } from '../questao/enums/status.enum';
import { TipoOrigem } from '../questao/enums/tipo-origem.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaRepository } from './prova.repository';
import { ProvaService } from './prova.service';

/**
 * tickets/023, card 14 — aplicar versão nova na prova e nos simulados DELA.
 *
 * ⚠️ Mongo standalone: sem transação. O `emTransacao` vira chamada direta —
 * o que se prova aqui é a regra e o alvo das escritas. O "tudo ou nada" dos
 * 400 vem de validar TUDO antes de escrever, e há teste. (O
 * `MongoMemoryReplSet` não passa do handshake neste ambiente; os e2e opt-in
 * do projeto usam `MONGODB_TEST_URI` para isso.)
 */
describe('aplicarAtualizacoes — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
  let categorias: Model<Categoria>;
  let questoes: Model<Questao>;
  let service: ProvaService;
  const auditLog = { create: jest.fn() };

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Categoria.name, schema: CategoriaSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [ProvaRepository, QuestaoRepository],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    simulados = mod.get(getModelToken(Simulado.name));
    categorias = mod.get(getModelToken(Categoria.name));
    questoes = mod.get(getModelToken(Questao.name));
    service = new ProvaService(
      {} as never,
      mod.get(ProvaRepository),
      {} as never,
      {} as never,
      mod.get(QuestaoRepository),
      auditLog as never,
    );
    jest
      .spyOn(service as any, 'emTransacao')
      .mockImplementation(async (escrever: any) => escrever(undefined));
  }, 120000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const q = async (o: Record<string, unknown> = {}) =>
    (
      await questoes.collection.insertOne({
        status: Status.Approved,
        congelada: false,
        ...o,
      } as never)
    ).insertedId;
  const versao = async (
    de: Types.ObjectId,
    o: Record<string, unknown> = {},
  ) => {
    await questoes.collection.updateOne(
      { _id: de },
      { $set: { congelada: true } },
    );
    return q({ origem: String(de), tipoOrigem: TipoOrigem.versao, ...o });
  };
  const sim = async (questao: Types.ObjectId, numero: number) =>
    (
      await simulados.collection.insertOne({
        nome: 's',
        questoes: [{ questao, numero }],
      } as never)
    ).insertedId;
  const prova = async (
    itens: [Types.ObjectId, number][],
    sims: Types.ObjectId[],
    cursinhoId = 'A',
  ) => {
    const categoria = (
      await categorias.collection.insertOne({
        nome: `c ${new Types.ObjectId()}`,
        dono: cursinhoId,
        selecionavel: true,
      } as never)
    ).insertedId;
    return (
      await provas.collection.insertOne({
        nome: 'P',
        categoria,
        cursinhoId,
        questoes: itens.map(([questao, numero]) => ({ questao, numero })),
        simulados: sims,
        totalQuestaoValidadas: itens.length,
      } as never)
    ).insertedId;
  };
  const ptr = async (m: Model<any>, id: Types.ObjectId) =>
    (await m.collection.findOne({ _id: id }))!.questoes[0];
  const ator = (o: Partial<Ator>): Ator => ({
    userId: 'u',
    cursinhoId: 'A',
    admin: false,
    editorCursinho: true,
    ...o,
  });

  beforeEach(() => auditLog.create.mockClear());

  it('⚠️ o dono aplica Q → Q″: prova e simulados DELA, mesmo número; a outra prova fica', async () => {
    const Q = await q();
    const Q1 = await versao(Q);
    const Q2 = await versao(Q1, { status: Status.Pending });
    const sA = await sim(Q, 12);
    const sOutra = await sim(Q, 12);
    const PA = await prova([[Q, 12]], [sA]);
    const Outra = await prova([[Q, 12]], [sOutra]);

    const r = await service.aplicarAtualizacoes(
      String(PA),
      [{ de: String(Q), para: String(Q2) }],
      ator({}),
    );

    expect(r).toEqual({ trocadas: 1, simulados: 1 });
    expect(await ptr(provas, PA)).toMatchObject({ questao: Q2, numero: 12 });
    expect(await ptr(simulados, sA)).toMatchObject({ questao: Q2, numero: 12 });
    // ⚠️ a outra prova e o simulado dela continuam com Q
    expect((await ptr(provas, Outra)).questao).toEqual(Q);
    expect((await ptr(simulados, sOutra)).questao).toEqual(Q);
    // aprovada → pendente: o contador cai
    expect(
      (await provas.collection.findOne({ _id: PA }))!.totalQuestaoValidadas,
    ).toBe(0);
    expect(JSON.parse(auditLog.create.mock.calls[0][0].changes)).toMatchObject({
      acao: 'aplicarVersao',
      de: String(Q),
      para: String(Q2),
    });
  });

  it('não dono e admin em prova de cursinho → 403, nada muda', async () => {
    const Q = await q();
    const Q1 = await versao(Q);
    const PA = await prova([[Q, 1]], []);
    for (const quem of [
      ator({ cursinhoId: 'B' }),
      ator({ cursinhoId: null, admin: true, editorCursinho: false }),
    ]) {
      await expect(
        service.aplicarAtualizacoes(
          String(PA),
          [{ de: String(Q), para: String(Q1) }],
          quem,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect((await ptr(provas, PA)).questao).toEqual(Q);
  });

  it('`para` fora da cadeia de `de` → 400', async () => {
    const Q = await q();
    await versao(Q);
    const qualquer = await q();
    const PA = await prova([[Q, 1]], []);
    await expect(
      service.aplicarAtualizacoes(
        String(PA),
        [{ de: String(Q), para: String(qualquer) }],
        ator({}),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('⚠️ várias trocas, uma inválida → NADA é trocado', async () => {
    const Q = await q();
    const Q1 = await versao(Q);
    const R = await q();
    const PA = await prova(
      [
        [Q, 1],
        [R, 2],
      ],
      [],
    );
    await expect(
      service.aplicarAtualizacoes(
        String(PA),
        [
          { de: String(Q), para: String(Q1) }, // válida
          { de: String(R), para: String(new Types.ObjectId()) }, // inválida
        ],
        ator({}),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await ptr(provas, PA)).questao).toEqual(Q);
  });

  it('`de` fora da prova, ou `para` já na prova → 400', async () => {
    const Q = await q();
    const Q1 = await versao(Q);
    const PA = await prova(
      [
        [Q, 1],
        [Q1, 2],
      ],
      [],
    );
    await expect(
      service.aplicarAtualizacoes(
        String(PA),
        [{ de: String(Q), para: String(Q1) }],
        ator({}),
      ),
    ).rejects.toThrow('já está nesta prova');
    await expect(
      service.aplicarAtualizacoes(
        String(PA),
        [{ de: String(new Types.ObjectId()), para: String(Q1) }],
        ator({}),
      ),
    ).rejects.toThrow('não está nesta prova');
  });
});

describe('emTransacao (023 · 14)', () => {
  const montar = () => {
    const session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };
    const service = new ProvaService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { startSession: async () => session } as never,
    );
    return { service: service as any, session };
  };

  it('erro no meio da escrita → aborta, não confirma, e propaga', async () => {
    const { service, session } = montar();
    await expect(
      service.emTransacao(async () => {
        throw new Error('caiu');
      }),
    ).rejects.toThrow('caiu');
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('tudo certo → confirma e passa a sessão adiante', async () => {
    const { service, session } = montar();
    const escrever = jest.fn();
    await service.emTransacao(escrever);
    expect(escrever).toHaveBeenCalledWith(session);
    expect(session.commitTransaction).toHaveBeenCalled();
  });
});
