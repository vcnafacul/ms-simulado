import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { condicoesDoFiltro } from './filtro-do-banco';
import { QuestaoRepository } from './questao.repository';
import { QuestaoService } from './questao.service';
import { Questao, QuestaoSchema } from './questao.schema';
import { QuestaoDTOInput } from './dtos/questao.dto.input';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/** tickets/043, card 01 — os filtros novos do banco, contra o Mongo real. */
describe('filtro do banco de questões (043/01) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let questoes: Model<Questao>;
  let provas: Model<Prova>;
  let repo: QuestaoRepository;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `filtro-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [QuestaoRepository],
    }).compile();
    questoes = mod.get(getModelToken(Questao.name));
    provas = mod.get(getModelToken(Prova.name));
    repo = mod.get(QuestaoRepository);
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const ENEM = new Types.ObjectId();
  const FUVEST = new Types.ObjectId();
  const CAT_ENEM_1 = new Types.ObjectId();
  const CAT_ENEM_2 = new Types.ObjectId();
  const CAT_FUVEST = new Types.ObjectId();
  const PERSONALIZADO = new Types.ObjectId();
  const CAT_PERS = new Types.ObjectId();
  const q = async (extra: object = {}) =>
    (await questoes.collection.insertOne({ status: 0, ...extra } as never))
      .insertedId;
  const ids = (xs: unknown[]) => xs.map(String).sort();

  let QA: Types.ObjectId, QB: Types.ObjectId, QC: Types.ObjectId;
  let QD: Types.ObjectId, QE: Types.ObjectId, QF: Types.ObjectId;
  beforeAll(async () => {
    await mod
      .get(getModelToken(Prova.name))
      .db.collection('categorias')
      .insertMany([
        { _id: CAT_ENEM_1, nome: 'Dia 1', exame: ENEM },
        { _id: CAT_ENEM_2, nome: 'Dia 2', exame: ENEM },
        { _id: CAT_FUVEST, nome: '1ª fase', exame: FUVEST },
        // 043/08: categoria criada pela tela — `exame` gravado em TEXTO.
        { _id: CAT_PERS, nome: 'Teste OMR', exame: String(PERSONALIZADO) },
      ]);
    QA = await q({
      textClassification: true,
      reported: true,
      imageId: 'a.png',
    });
    QB = await q({ textClassification: true, imageId: null });
    QC = await q({ reported: true, imageId: '' });
    QD = await q({}); // sem imageId nenhum (questão antiga)
    QE = await q({ textClassification: true, reported: true });
    QF = await q({});
    await provas.collection.insertMany([
      {
        nome: 'Enem D1',
        categoria: CAT_ENEM_1,
        questoes: [{ questao: QA }, { questao: QB }],
      },
      {
        nome: 'Enem D2',
        categoria: CAT_ENEM_2,
        questoes: [{ questao: QC }, { questao: QA }],
      },
      {
        nome: 'Fuvest',
        categoria: CAT_FUVEST,
        ano: 2023,
        questoes: [{ questao: QD }],
      },
      {
        nome: 'Excluída',
        categoria: CAT_ENEM_1,
        deleted: true,
        questoes: [{ questao: QE }],
      },
      {
        nome: 'Teste OMR_20261003',
        categoria: CAT_PERS,
        questoes: [{ questao: QF }],
      },
    ] as never);
  });

  it('exame: questões de todas as provas do exame (sem repetir, sem prova excluída)', async () => {
    expect(
      ids(await repo.findQuestaoIdsDasProvas({ exame: String(ENEM) })),
    ).toEqual(ids([QA, QB, QC]));
  });

  it('⚠️ 043/08: exame gravado em TEXTO na categoria (criada pela tela) também casa', async () => {
    expect(
      await repo.findQuestaoIdsDasProvas({ exame: String(PERSONALIZADO) }),
    ).toEqual([String(QF)]);
    expect(
      await repo.findQuestaoIdsDasProvas({
        exame: String(PERSONALIZADO),
        categoria: String(CAT_PERS),
      }),
    ).toEqual([String(QF)]);
  });

  it('043/09: ano — questões das provas daquele ano; combina com exame', async () => {
    expect(await repo.findQuestaoIdsDasProvas({ ano: 2023 })).toEqual([
      String(QD),
    ]);
    expect(
      await repo.findQuestaoIdsDasProvas({ ano: 2023, exame: String(ENEM) }),
    ).toEqual([]);
    expect(await repo.findQuestaoIdsDasProvas({ ano: 1999 })).toEqual([]);
  });

  it('categoria: só as provas daquela categoria', async () => {
    expect(
      ids(
        await repo.findQuestaoIdsDasProvas({ categoria: String(CAT_ENEM_2) }),
      ),
    ).toEqual(ids([QC, QA]));
  });

  it('exame + categoria de outro exame → nada', async () => {
    expect(
      await repo.findQuestaoIdsDasProvas({
        exame: String(FUVEST),
        categoria: String(CAT_ENEM_1),
      }),
    ).toEqual([]);
  });

  it('revisões em "e": precisa de TODAS as marcadas', async () => {
    const achadas = await questoes
      .find(condicoesDoFiltro({ revisoes: 'textClassification,reported' }))
      .lean();
    expect(ids(achadas.map((x) => x._id))).toEqual(ids([QA, QE]));
    const so = await questoes
      .find(condicoesDoFiltro({ revisoes: 'reported' }))
      .lean();
    expect(ids(so.map((x) => x._id))).toEqual(ids([QA, QC, QE]));
  });

  it('⚠️ sem imagem: nulo, vazio e SEM o campo entram; quem tem imagem fica de fora', async () => {
    const achadas = await questoes
      .find(condicoesDoFiltro({ semImagem: 'true' }))
      .lean();
    expect(ids(achadas.map((x) => x._id))).toEqual(ids([QB, QC, QD, QE, QF]));
  });

  it('revisões + sem imagem combinam em "e"', async () => {
    const achadas = await questoes
      .find(
        condicoesDoFiltro({
          revisoes: 'textClassification,reported',
          semImagem: 'true',
        }),
      )
      .lean();
    expect(ids(achadas.map((x) => x._id))).toEqual(ids([QE]));
  });

  it('DTO: revisões só aceita os nomes conhecidos; exame/categoria são ObjectId', async () => {
    const erros = async (o: object) =>
      (
        await validate(
          plainToInstance(QuestaoDTOInput, { page: 1, limit: 10, ...o }),
        )
      ).map((e) => e.property);
    expect(await erros({ revisoes: 'textClassification,reported' })).toEqual(
      [],
    );
    expect(await erros({ revisoes: 'textClassification,imageId' })).toEqual([
      'revisoes',
    ]);
    expect(await erros({ exame: 'x' })).toEqual(['exame']);
    expect(await erros({ ano: '2023' })).toEqual([]);
    expect(await erros({ ano: '23' })).toEqual(['ano']);
    expect(
      await erros({ categoria: String(CAT_ENEM_1), semImagem: 'true' }),
    ).toEqual([]);
  });
});

describe('QuestaoService.getAll — fiação dos filtros novos (043/01)', () => {
  const montar = () => {
    const repository = {
      findQuestaoIdsByProva: jest.fn().mockResolvedValue(['p1']),
      findQuestaoIdsDasProvas: jest.fn().mockResolvedValue(['e1', 'e2']),
      getAll: jest
        .fn()
        .mockResolvedValue({ data: [], page: 1, limit: 10, totalItems: 0 }),
      findProvasContendoMany: jest.fn().mockResolvedValue(new Map()),
    };
    const svc = new (QuestaoService as unknown as new (
      ...a: unknown[]
    ) => QuestaoService)(repository, {}, {}, {}, {}, {}, {}, {}, {});
    return { svc, repository };
  };
  const base = { page: 1, limit: 10 };
  const dto = (o: object) => ({ ...base, ...o }) as unknown as QuestaoDTOInput;

  it('exame/categoria viram o conjunto de questões; revisões e imagem entram no where', async () => {
    const { svc, repository } = montar();
    await svc.getAll(
      dto({
        exame: 'ex',
        categoria: 'cat',
        revisoes: 'reported,textClassification',
        semImagem: 'true',
      }),
    );
    expect(repository.findQuestaoIdsDasProvas).toHaveBeenCalledWith({
      exame: 'ex',
      categoria: 'cat',
    });
    expect(repository.getAll.mock.calls[0][0].where).toMatchObject({
      _id: { $in: ['e1', 'e2'] },
      reported: true,
      textClassification: true,
      imageId: { $in: [null, ''] },
    });
  });

  it('ano sozinho também vira o conjunto (como número)', async () => {
    const { svc, repository } = montar();
    await svc.getAll(dto({ ano: '2023' }));
    expect(repository.findQuestaoIdsDasProvas).toHaveBeenCalledWith({
      exame: undefined,
      categoria: undefined,
      ano: 2023,
    });
  });

  it('com prova, a prova vence exame/categoria', async () => {
    const { svc, repository } = montar();
    await svc.getAll(dto({ prova: 'p', exame: 'ex' }));
    expect(repository.findQuestaoIdsDasProvas).not.toHaveBeenCalled();
    expect(repository.getAll.mock.calls[0][0].where._id).toEqual({
      $in: ['p1'],
    });
  });
});
