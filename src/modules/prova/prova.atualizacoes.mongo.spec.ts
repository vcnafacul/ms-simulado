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
 * tickets/023, card 13 — "Buscar atualizações" contra o Mongo real: a cadeia
 * vem de `origem`/`tipoOrigem`, as excluídas somem dela, e a prova guarda
 * `questoes[].questao` como ObjectId.
 */
describe('listarAtualizacoes — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let categorias: Model<Categoria>;
  let questoes: Model<Questao>;
  let service: ProvaService;

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
    categorias = mod.get(getModelToken(Categoria.name));
    questoes = mod.get(getModelToken(Questao.name));
    service = new ProvaService(
      {} as never,
      mod.get(ProvaRepository),
      {} as never,
      {} as never,
      mod.get(QuestaoRepository),
    );
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const q = async (o: Record<string, unknown> = {}) =>
    (
      await questoes.collection.insertOne({
        status: Status.Approved,
        textoQuestao: 'v',
        congelada: false,
        ...o,
      } as never)
    ).insertedId;
  /** A versão seguinte de `de`. */
  const versao = async (
    de: Types.ObjectId,
    o: Record<string, unknown> = {},
  ) => {
    await questoes.collection.updateOne(
      { _id: de },
      // 023 · 18: a original ganha teveSucessora e segue viva (não congela)
      { $set: { teveSucessora: true } },
    );
    return q({ origem: String(de), tipoOrigem: TipoOrigem.versao, ...o });
  };
  const prova = async (itens: [Types.ObjectId, number][], cursinhoId = 'A') => {
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
        simulados: [],
      } as never)
    ).insertedId.toString();
  };
  const dono: Ator = {
    userId: 'u',
    cursinhoId: 'A',
    admin: false,
    editorCursinho: true,
  };

  it('prova sem questões com versão nova → []', async () => {
    const id = await prova([[await q(), 1]]);
    await expect(service.listarAtualizacoes(id, dono)).resolves.toEqual({
      podeComporProva: true,
      atualizacoes: [],
    });
  });

  it('⚠️ Q → Q′ → Q″: oferece Q″, saltos 2, e Pending aparece', async () => {
    const Q = await q({ textoQuestao: 'antes' });
    const Q1 = await versao(Q);
    const Q2 = await versao(Q1, {
      status: Status.Pending,
      textoQuestao: 'depois',
    });
    const id = await prova([[Q, 12]]);

    const { atualizacoes } = await service.listarAtualizacoes(id, dono);

    expect(atualizacoes).toHaveLength(1);
    expect(atualizacoes[0]).toMatchObject({
      numero: 12,
      atual: { _id: String(Q), status: Status.Approved },
      oferta: { _id: String(Q2), status: Status.Pending, saltos: 2 },
      cadeiaInterrompida: false,
      camposAlterados: ['textoQuestao'],
    });
  });

  it('oferta já na prova (alguém adicionou à mão) → não aparece', async () => {
    const Q = await q();
    const Q1 = await versao(Q);
    const id = await prova([
      [Q, 1],
      [Q1, 2],
    ]);
    expect((await service.listarAtualizacoes(id, dono)).atualizacoes).toEqual(
      [],
    );
  });

  it('⚠️ versão excluída no fim: oferece a última viva e marca cadeiaInterrompida', async () => {
    const Q = await q();
    const Q1 = await versao(Q);
    await versao(Q1, { deleted: true }); // Q1 congelou, a seguinte foi excluída
    const id = await prova([[Q, 3]]);

    const { atualizacoes } = await service.listarAtualizacoes(id, dono);

    expect(atualizacoes[0]).toMatchObject({
      oferta: { _id: String(Q1), saltos: 1 },
      cadeiaInterrompida: true,
    });
  });

  it('prova de outro cursinho: lista, com podeComporProva false', async () => {
    const Q = await q();
    await versao(Q);
    const id = await prova([[Q, 1]], 'B');
    const r = await service.listarAtualizacoes(id, dono);
    expect(r.podeComporProva).toBe(false);
    expect(r.atualizacoes).toHaveLength(1);
  });

  it('⚠️ 023 · 19: a original NÃO congelada (ficou na prova fixa) aparece com a versão nova', async () => {
    const A = await q();
    const A2 = await versao(A);
    const id = await prova([[A, 4]]);
    expect((await questoes.collection.findOne({ _id: A }))!.congelada).toBe(
      false,
    );

    const { atualizacoes } = await service.listarAtualizacoes(id, dono);

    expect(atualizacoes[0]).toMatchObject({
      atual: { _id: String(A) },
      oferta: { _id: String(A2), saltos: 1 },
      cadeiaInterrompida: false,
    });
  });

  it('rede: questão congelada ANTES da migração 0005 (sem teveSucessora) ainda é vista', async () => {
    const A = await q({ congelada: true });
    const A2 = await q({ origem: String(A), tipoOrigem: TipoOrigem.versao });
    const id = await prova([[A, 1]]);
    const { atualizacoes } = await service.listarAtualizacoes(id, dono);
    expect(atualizacoes[0].oferta._id).toBe(String(A2));
  });
});
