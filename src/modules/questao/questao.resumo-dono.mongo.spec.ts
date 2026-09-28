import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import {
  Categoria,
  CategoriaSchema,
  DONO_SYSTEM,
} from '../categoria/schemas/categoria.schema';
import { Exame, ExameSchema } from '../exame/exame.schema';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { QuestaoRepository } from './questao.repository';
import { Questao, QuestaoSchema } from './questao.schema';
import { QuestaoService } from './questao.service';

/**
 * tickets/023, card 07 — cada prova que a tela vê chega com dono, proteção e
 * `podeComporProva` para o ator da requisição. Mongo real: a categoria tem de
 * chegar populada, e a prova legada (sem `cursinhoId`) é da plataforma.
 */
describe('resumo do dono nas provas — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let categorias: Model<Categoria>;
  let questoes: Model<Questao>;
  let service: QuestaoService;

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
          { name: Categoria.name, schema: CategoriaSchema },
          { name: Exame.name, schema: ExameSchema },
        ]),
      ],
      providers: [QuestaoRepository, ProvaRepository],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    categorias = mod.get(getModelToken(Categoria.name));
    questoes = mod.get(getModelToken(Questao.name));
    const vazio = { getAll: async () => ({ data: [] as unknown[] }) };
    service = new QuestaoService(
      mod.get(QuestaoRepository),
      {} as never,
      mod.get(ProvaRepository),
      vazio as never,
      vazio as never,
      vazio as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const cat = async (dono: string, selecionavel = true) =>
    (
      await categorias.collection.insertOne({
        nome: `c ${new Types.ObjectId()}`,
        dono,
        selecionavel,
        exame: new Types.ObjectId(),
      } as never)
    ).insertedId;
  const prova = async (
    nome: string,
    questao: Types.ObjectId,
    categoria: Types.ObjectId,
    extra: object = {},
  ) =>
    (
      await provas.collection.insertOne({
        nome,
        categoria,
        questoes: [{ questao, numero: 1 }],
        simulados: [],
        ...extra,
      } as never)
    ).insertedId.toString();

  const ator = (o: Partial<Ator>): Ator => ({
    userId: 'u',
    cursinhoId: null,
    admin: false,
    editorCursinho: false,
    ...o,
  });

  let Q: Types.ObjectId;
  let PA: string, PB: string, PP: string, PAns: string;
  beforeAll(async () => {
    Q = (await questoes.collection.insertOne({ status: 0 } as never))
      .insertedId;
    PA = await prova('PA', Q, await cat('A'), {
      cursinhoId: 'A',
      receberNovasVersoes: false,
    });
    PB = await prova('PB', Q, await cat('B'), { cursinhoId: 'B' });
    PP = await prova('PP', Q, await cat(DONO_SYSTEM)); // legada, sem cursinhoId
    PAns = await prova('PAns', Q, await cat('A', false), { cursinhoId: 'A' });
  });

  const contendo = async (quem: Ator) =>
    Object.fromEntries(
      (await service.getById(String(Q), quem))!.provasContendo.map((p) => [
        p.provaNome,
        p,
      ]),
    );

  it('editor do A: só a PA; PB, oficial e não-selecionável não', async () => {
    const p = await contendo(ator({ cursinhoId: 'A', editorCursinho: true }));
    expect(p.PA).toMatchObject({
      provaId: PA,
      cursinhoId: 'A',
      protegida: false,
      selecionavel: true,
      receberNovasVersoes: false,
      podeComporProva: true,
    });
    expect(p.PB.podeComporProva).toBe(false);
    expect(p.PP).toMatchObject({
      provaId: PP,
      cursinhoId: null,
      protegida: true,
      podeComporProva: false,
    });
    expect(p.PAns).toMatchObject({
      provaId: PAns,
      protegida: true,
      selecionavel: false,
      podeComporProva: false,
    });
  });

  it('admin: a da plataforma sim, as de cursinho não', async () => {
    const p = await contendo(ator({ admin: true }));
    expect(p.PP.podeComporProva).toBe(true);
    expect(p.PA.podeComporProva).toBe(false);
    expect(p.PB.podeComporProva).toBe(false);
  });

  it('sem ator: ninguém compõe, mas todos veem (R1)', async () => {
    const p = await contendo(undefined as never);
    expect(Object.keys(p).sort()).toEqual(['PA', 'PAns', 'PB', 'PP']);
    expect(Object.values(p).every((x) => x.podeComporProva === false)).toBe(
      true,
    );
  });

  it('infos: todas as provas com o resumo, e o documento de antes intacto', async () => {
    const { provas: lista } = await service.getInfos(
      ator({ cursinhoId: 'B', editorCursinho: true }),
    );
    const pb = lista.find((p: any) => String(p._id) === PB);
    expect(pb).toMatchObject({
      nome: 'PB',
      cursinhoId: 'B',
      protegida: false,
      podeComporProva: true,
    });
    expect(pb.questoes).toHaveLength(1); // campo que a tela já usava
  });
});
