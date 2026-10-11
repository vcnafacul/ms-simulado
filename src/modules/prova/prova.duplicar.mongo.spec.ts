import { ForbiddenException, HttpException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import {
  Categoria,
  CategoriaSchema,
  DONO_CURSINHO,
  DONO_SYSTEM,
} from '../categoria/schemas/categoria.schema';
import { Exame, ExameSchema } from '../exame/exame.schema';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CustomProvaFactory } from './factory/custom_prova_factory';
import { EnemCursinhoFactory } from './factory/enem_cursinho_factory';
import { Idioma } from '../simulado/enums/idioma.enum';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaRepository } from './prova.repository';
import { ProvaService } from './prova.service';

/**
 * tickets/027, card 01 — duplicar prova do cursinho, Mongo real.
 * A fábrica é a de verdade (`CustomProvaFactory`), para a cópia nascer como
 * qualquer prova do cursinho.
 */
describe('duplicar prova — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
  let categorias: Model<Categoria>;
  let questoes: Model<Questao>;
  let exames: Model<Exame>;
  let service: ProvaService;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `duplicar-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Categoria.name, schema: CategoriaSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Exame.name, schema: ExameSchema },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [ProvaRepository, QuestaoRepository, SimuladoRepository],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    simulados = mod.get(getModelToken(Simulado.name));
    categorias = mod.get(getModelToken(Categoria.name));
    questoes = mod.get(getModelToken(Questao.name));
    exames = mod.get(getModelToken(Exame.name));
    const provaRepo = mod.get(ProvaRepository);
    const simuladoRepo = mod.get(SimuladoRepository);
    const questaoRepo = mod.get(QuestaoRepository);
    const fabrica = {
      getFactory: (categoria: Categoria) =>
        categoria.dono === DONO_CURSINHO
          ? new EnemCursinhoFactory(
              questaoRepo,
              provaRepo,
              {} as never,
              {} as never,
              simuladoRepo,
              {} as never,
              categoria,
            )
          : new CustomProvaFactory(
              questaoRepo,
              provaRepo,
              {} as never,
              simuladoRepo,
              categoria,
            ),
    };
    service = new ProvaService(
      fabrica as never,
      provaRepo,
      {} as never,
      simuladoRepo,
      questaoRepo,
    );
  }, 120000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const ator = (o: Partial<Ator> = {}): Ator => ({
    userId: 'colab-A',
    cursinhoId: 'A',
    admin: false,
    editorCursinho: true,
    ...o,
  });

  /** "Simulado Inglês": 3 questões (1 pendente), com o seu simulado. */
  const montarOrigem = async (dono = 'A') => {
    const exame = (await exames.collection.insertOne({ nome: 'ENEM' } as never))
      .insertedId;
    const categoria = (
      await categorias.collection.insertOne({
        nome: `cat ${new Types.ObjectId()}`,
        dono,
        custom: dono !== DONO_SYSTEM,
        selecionavel: true,
        exame,
        quantidadeTotalQuestao: 3,
      } as never)
    ).insertedId;
    const ids = [];
    for (const status of [Status.Approved, Status.Approved, Status.Pending]) {
      ids.push(
        (
          await questoes.collection.insertOne({
            status,
            enunciado: 'q',
          } as never)
        ).insertedId,
      );
    }
    const itens = ids.map((questao, i) => ({ questao, numero: i + 1 }));
    const sim = (
      await simulados.collection.insertOne({
        nome: 'Simulado Inglês',
        questoes: itens,
        categoria,
      } as never)
    ).insertedId;
    const origem = (
      await provas.collection.insertOne({
        nome: `Simulado Inglês ${new Types.ObjectId()}`,
        categoria,
        cursinhoId: dono === DONO_SYSTEM ? null : dono,
        criadorId: 'quem-criou',
        ano: 2026,
        edicao: 'Regular',
        aplicacao: 1,
        questoes: itens,
        simulados: [sim],
        totalQuestaoValidadas: 2,
        receberNovasVersoes: true,
        inicialNumero: 1,
      } as never)
    ).insertedId;
    return { origem: String(origem), ids, sim };
  };

  it('⚠️ cópia com as MESMAS questões e números; nada novo no banco de questões', async () => {
    const { origem, ids } = await montarOrigem();
    const antes = await questoes.countDocuments();

    const r = await service.duplicar(origem, 'Simulado Espanhol', ator());

    expect(await questoes.countDocuments()).toBe(antes);
    expect(r).toMatchObject({
      nome: 'Simulado Espanhol',
      totalQuestaoCadastradas: 3,
      totalQuestaoValidadas: 2,
      provaOrigemId: origem,
      receberNovasVersoes: true,
    });
    const copia = await provas.collection.findOne({ _id: r._id as never });
    expect(
      copia!.questoes.map((q: any) => [String(q.questao), q.numero]),
    ).toEqual(ids.map((id, i) => [String(id), i + 1]));
    expect(copia!.cursinhoId).toBe('A');
    expect(copia!.criadorId).toBe('colab-A');

    // 1 simulado próprio, com as mesmas questões
    expect(copia!.simulados).toHaveLength(1);
    const sim = await simulados.collection.findOne({
      _id: copia!.simulados[0],
    });
    expect(sim!.nome).toBe('Simulado Espanhol');
    expect(sim!.questoes.map((q: any) => String(q.questao))).toEqual(
      ids.map(String),
    );
    expect(sim!.bloqueado).toBe(true); // tem questão pendente
  });

  it('renumerar na cópia não mexe na origem', async () => {
    const { origem } = await montarOrigem();
    const r = await service.duplicar(origem, 'Cópia', ator());
    await provas.collection.updateOne(
      { _id: r._id as never },
      { $set: { 'questoes.0.numero': 99 } },
    );
    const o = await provas.collection.findOne({
      _id: new Types.ObjectId(origem),
    });
    expect(o!.questoes[0].numero).toBe(1);
  });

  it('prova de outro cursinho → 403; prova oficial → 403; sem ator → 403', async () => {
    const doB = await montarOrigem('B');
    await expect(service.duplicar(doB.origem, 'X', ator())).rejects.toThrow(
      ForbiddenException,
    );
    const oficial = await montarOrigem(DONO_SYSTEM);
    await expect(
      service.duplicar(
        oficial.origem,
        'X',
        ator({ cursinhoId: null as never }),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.duplicar(doB.origem, 'X', undefined)).rejects.toThrow(
      ForbiddenException,
    );
  });

  describe('ENEM do cursinho Dia 1 (tickets/038, R4)', () => {
    /**
     * Origem: Inglês no 1 (só no simulado Inglês), Espanhol no 1 (só no
     * Espanhol), História no 6 (nos dois).
     */
    const montarEnem = async () => {
      const exame = (
        await exames.collection.insertOne({ nome: 'ENEM' } as never)
      ).insertedId;
      const categoria = (
        await categorias.collection.insertOne({
          nome: 'Enem Dia 1',
          dono: DONO_CURSINHO,
          custom: false,
          selecionavel: true,
          exame,
          quantidadeTotalQuestao: 90,
        } as never)
      ).insertedId;
      const ids: Types.ObjectId[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(
          (
            await questoes.collection.insertOne({
              status: Status.Approved,
              enunciado: `q${i}`,
            } as never)
          ).insertedId,
        );
      }
      const [qIng, qEsp, qHist] = ids;
      const sim = async (idioma: Idioma, qs: [Types.ObjectId, number][]) =>
        (
          await simulados.collection.insertOne({
            nome: `Origem ${idioma}`,
            idioma,
            categoria,
            questoes: qs.map(([questao, numero]) => ({ questao, numero })),
          } as never)
        ).insertedId;
      const simIng = await sim(Idioma.Ingles, [
        [qIng, 1],
        [qHist, 6],
      ]);
      const simEsp = await sim(Idioma.Espanhol, [
        [qEsp, 1],
        [qHist, 6],
      ]);
      const origem = (
        await provas.collection.insertOne({
          nome: `Origem ${new Types.ObjectId()}`,
          categoria,
          cursinhoId: 'A',
          criadorId: 'quem-criou',
          questoes: [
            { questao: qIng, numero: 1 },
            { questao: qEsp, numero: 1 },
            { questao: qHist, numero: 6 },
          ],
          simulados: [simIng, simEsp],
          totalQuestaoValidadas: 3,
          inicialNumero: 1,
          enemAreas: ['Linguagens', 'Ciências Humanas'],
        } as never)
      ).insertedId;
      return { origem: String(origem), qIng, qEsp, qHist };
    };

    it('⚠️ 2 simulados, cada questão no simulado do seu idioma, mesmos números', async () => {
      const { origem, qIng, qEsp, qHist } = await montarEnem();

      const r = await service.duplicar(origem, 'Cópia ENEM', ator());

      const copia = await provas.collection.findOne({ _id: r._id as never });
      expect(copia!.questoes).toHaveLength(3);
      const sims = await simulados.collection
        .find({ _id: { $in: copia!.simulados } })
        .toArray();
      const conteudo = (idioma: Idioma) =>
        sims
          .find((s) => s.idioma === idioma)!
          .questoes.map((q: any) => [String(q.questao), q.numero]);
      expect(sims.map((s) => s.nome).sort()).toEqual([
        'Cópia ENEM Espanhol',
        'Cópia ENEM Inglês',
      ]);
      expect(conteudo(Idioma.Ingles)).toEqual([
        [String(qIng), 1],
        [String(qHist), 6],
      ]);
      expect(conteudo(Idioma.Espanhol)).toEqual([
        [String(qEsp), 1],
        [String(qHist), 6],
      ]);
      expect(r).toMatchObject({ totalQuestao: 95, provaOrigemId: origem });
    });
  });

  it('nome já usado no cursinho → 409, e nenhum simulado sobra', async () => {
    const { origem } = await montarOrigem();
    const nome = (await provas.collection.findOne({
      _id: new Types.ObjectId(origem),
    }))!.nome;
    const simuladosAntes = await simulados.countDocuments();
    const erro = await service.duplicar(origem, nome, ator()).catch((e) => e);
    expect(erro).toBeInstanceOf(HttpException);
    expect((erro as HttpException).getStatus()).toBe(409);
    expect(await simulados.countDocuments()).toBe(simuladosAntes);
  });

  it('⚠️ falha depois de o simulado existir: ele é excluído (soft), nada fica pendurado', async () => {
    const { origem } = await montarOrigem();
    const repo = mod.get(ProvaRepository);
    const falha = jest
      .spyOn(repo, 'create')
      .mockRejectedValueOnce(new Error('queda do banco'));
    const antes = await simulados
      .find({ deleted: { $ne: true } })
      .countDocuments();

    await expect(
      service.duplicar(origem, 'Vai falhar', ator()),
    ).rejects.toThrow('queda do banco');
    expect(
      await simulados.find({ deleted: { $ne: true } }).countDocuments(),
    ).toBe(antes);
    expect(await provas.countDocuments({ nome: 'Vai falhar' })).toBe(0);
    falha.mockRestore();
  });
});
