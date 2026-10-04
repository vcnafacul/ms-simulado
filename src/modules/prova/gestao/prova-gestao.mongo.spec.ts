import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import { CategoriaRepository } from '../../categoria/categoria.repository';
import {
  Categoria,
  CategoriaSchema,
} from '../../categoria/schemas/categoria.schema';
import { Exame, ExameSchema } from '../../exame/exame.schema';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../../historico/historico.repository';
import { Historico, HistoricoSchema } from '../../historico/historico.schema';
import { Questao, QuestaoSchema } from '../../questao/questao.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../../simulado/simulado.repository';
import { ProvaRepository } from '../prova.repository';
import { Prova, ProvaSchema } from '../prova.schema';
import { ProvaService } from '../prova.service';
import { ProvaGestaoService } from './prova-gestao.service';

/**
 * Card 41 — editar e excluir prova do cursinho, Mongo real. O que só o banco
 * prova: a exclusão lógica some das listagens, libera o nome e a categoria.
 */
describe('gestão da prova do cursinho — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
  let categorias: Model<Categoria>;
  let historicos: Model<Historico>;
  let provaRepo: ProvaRepository;
  let gestao: ProvaGestaoService;
  let provaService: ProvaService;
  const auditLog = { create: jest.fn() };

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `gestao-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Categoria.name, schema: CategoriaSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Exame.name, schema: ExameSchema },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [
        ProvaRepository,
        SimuladoRepository,
        CategoriaRepository,
        HistoricoRepository,
      ],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    simulados = mod.get(getModelToken(Simulado.name));
    categorias = mod.get(getModelToken(Categoria.name));
    historicos = mod.get(getModelToken(Historico.name));
    provaRepo = mod.get(ProvaRepository);
    gestao = new ProvaGestaoService(
      provaRepo,
      mod.get(CategoriaRepository),
      mod.get(SimuladoRepository),
      mod.get(HistoricoRepository),
      auditLog as never,
    );
    provaService = new ProvaService(
      {} as never,
      provaRepo,
      {} as never,
      {} as never,
      {} as never,
    );
  }, 120000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const ator: Ator = {
    userId: 'colab-A',
    cursinhoId: 'cur-A',
    admin: false,
    editorCursinho: false,
  };

  /** `create` com `as never` cai na sobrecarga de lista — o tipo volta aqui. */
  const criar = async <T>(model: Model<T>, doc: object) =>
    (await model.create(doc as never)) as unknown as { _id: Types.ObjectId };

  const montarProva = async (nome: string) => {
    const categoria = await criar(categorias, {
      nome: `Cat ${new Types.ObjectId()}`,
      duracao: 60,
      quantidadeTotalQuestao: 10,
      dono: 'cur-A',
      selecionavel: true,
      exame: new Types.ObjectId(),
    });
    const simulado = await criar(simulados, {
      nome,
      descricao: 'Simulado',
      categoria: categoria._id,
      questoes: [],
      cursinhoId: 'cur-A',
    });
    const prova = await criar(provas, {
      nome,
      ano: 2023,
      edicao: 'Regular',
      aplicacao: 1,
      categoria: categoria._id,
      simulados: [simulado._id],
      questoes: [],
      criadorId: 'colab-A',
      cursinhoId: 'cur-A',
      totalQuestao: 10,
    });
    return { prova, simulado, categoria };
  };

  it('⚠️ excluída: some da listagem do cursinho, do GET por id, e libera nome e categoria', async () => {
    const { prova, simulado, categoria } = await montarProva('teste');

    await gestao.excluir(String(prova._id), ator);

    const lista = await provaRepo.getAll({
      page: 1,
      limit: 50,
      where: { cursinhoId: 'cur-A' },
    } as never);
    expect(lista.data.map((p) => String(p._id))).not.toContain(
      String(prova._id),
    );
    expect(
      await provaService.getByIdComDono(String(prova._id), ator),
    ).toBeNull();
    // o nome "teste" volta a ficar livre no cursinho
    expect(
      await provaRepo.getAtivaByNomeECursinho('teste', 'cur-A'),
    ).toBeNull();
    // e a categoria pode ser excluída
    expect(await provaRepo.countByCategoria(String(categoria._id))).toBe(0);
    // o simulado é arquivado junto
    const s = await simulados
      .findById(simulado._id)
      .select('+deleted bloqueado')
      .lean();
    expect(s).toMatchObject({ deleted: true, bloqueado: true });
  });

  it('⚠️ com cartão enviado (mesmo com falha) não exclui', async () => {
    const { prova, simulado } = await montarProva('com cartão');
    await historicos.create({
      usuario: 'aluno',
      simulado: simulado._id,
      status: HistoricoStatus.Failed,
      cartaoCode: '1',
    } as never);

    await expect(gestao.excluir(String(prova._id), ator)).rejects.toThrow(
      'alunos já enviaram cartões',
    );
    expect(await provaRepo.estaExcluida(String(prova._id))).toBe(false);
  });

  it('renomear: prova e simulado com o nome novo; o antigo fica livre', async () => {
    const { prova, simulado } = await montarProva('nome antigo');

    await gestao.editar(
      String(prova._id),
      { nome: 'nome novo', ano: 2026 },
      ator,
    );

    const p = await provas.findById(prova._id).lean();
    expect(p).toMatchObject({ nome: 'nome novo', ano: 2026 });
    expect((await simulados.findById(simulado._id).lean())?.nome).toBe(
      'nome novo',
    );
    expect(
      await provaRepo.getAtivaByNomeECursinho('nome antigo', 'cur-A'),
    ).toBeNull();
  });
});
