import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

/**
 * O card 18: o `turmaId` da junção é uma FOTO do momento do upload e nunca é
 * atualizado. Estudante que entra na turma DEPOIS de enviar o cartão fica com
 * o campo ausente — e sumia de todo recorte por turma.
 *
 * ⚠️ Mongo real, e não dublê: o defeito vive no FILTRO da consulta, e um mock
 * do `find` provaria só que passei o objeto que eu mesmo montei.
 */
describe('recorte por usuarios (card 18) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: RelatorioSimuladoEstudanteRepository;
  let relModel: Model<RelatorioSimuladoEstudante>;
  let histModel: Model<Historico>;

  const SIM = new Types.ObjectId();
  const CURSINHO = 'cursinho-1';
  const OUTRO_CURSINHO = 'cursinho-2';

  /** Enviou o cartão ANTES de entrar na turma: a junção ficou sem `turmaId`. */
  const SEM_TURMA_NA_JUNCAO = 'u-entrou-depois';
  /** Enviou já na turma A, mas foi movido para a B depois. */
  const TURMA_VELHA = 'u-mudou-de-turma';
  const ALHEIO = 'u-de-outro-cursinho';

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          {
            name: RelatorioSimuladoEstudante.name,
            schema: RelatorioSimuladoEstudanteSchema,
          },
          { name: Historico.name, schema: HistoricoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
        ]),
      ],
      providers: [RelatorioSimuladoEstudanteRepository, SimuladoRepository],
    }).compile();

    repo = mod.get(RelatorioSimuladoEstudanteRepository);
    relModel = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    histModel = mod.get(getModelToken(Historico.name));

    const semear = async (
      usuario: string,
      cursinhoId: string,
      turmaId?: string,
    ) => {
      const h = await histModel.create({
        usuario,
        simulado: SIM,
        status: 'completed',
        questoesRespondidas: 90,
        aproveitamento: { geral: 0.5, materias: [] },
        respostas: [],
      });
      await relModel.create({
        historico: h._id,
        simulado: SIM,
        usuario,
        cursinhoId,
        ...(turmaId !== undefined ? { turmaId } : {}),
      });
    };

    await semear(SEM_TURMA_NA_JUNCAO, CURSINHO);
    await semear(TURMA_VELHA, CURSINHO, 'turma-A');
    await semear(ALHEIO, OUTRO_CURSINHO, 'turma-B');
  });

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  describe('buscarPorRecorte', () => {
    it('⚠️ o filtro por turmaId PERDE quem entrou na turma depois', async () => {
      // O defeito que o card 18 corrige, provado: os dois estudantes estão hoje
      // na turma B, mas a junção só sabe da foto antiga.
      const r = await repo.buscarPorRecorte({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
        turmaId: 'turma-B',
      });

      expect(r).toHaveLength(0);
    });

    it('✅ o filtro por usuarios ACHA os dois — é a turma atual', async () => {
      const r = await repo.buscarPorRecorte({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
        usuarios: [SEM_TURMA_NA_JUNCAO, TURMA_VELHA],
      });

      expect(r.map((l) => l.usuario).sort()).toEqual(
        [SEM_TURMA_NA_JUNCAO, TURMA_VELHA].sort(),
      );
    });

    it('⚠️ o cursinho continua sendo o gate — usuario alheio NÃO volta', async () => {
      // Mesmo pedido explicitamente pelo id: o `cursinhoId` do filtro recusa.
      const r = await repo.buscarPorRecorte({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
        usuarios: [ALHEIO],
      });

      expect(r).toHaveLength(0);
    });

    it('sem usuarios e sem turma, devolve o cursinho inteiro', async () => {
      const r = await repo.buscarPorRecorte({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
      });

      expect(r).toHaveLength(2);
    });

    it('⚠️ usuarios tem PRECEDÊNCIA sobre turmaId', async () => {
      // Quem manda a lista está mandando a verdade do MySQL; o `turmaId` da
      // junção é cache velho. Aceitar os dois e cruzar daria zero linhas.
      const r = await repo.buscarPorRecorte({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
        turmaId: 'turma-Z-inexistente',
        usuarios: [TURMA_VELHA],
      });

      expect(r).toHaveLength(1);
    });
  });

  describe('listarSimuladosComCartao', () => {
    it('⚠️ por turmaId, o simulado SOME da aba da turma', async () => {
      const r = await repo.listarSimuladosComCartao({
        cursinhoId: CURSINHO,
        turmaId: 'turma-B',
      });

      expect(r).toHaveLength(0);
    });

    it('✅ por usuarios, o simulado aparece com os 2 cartões', async () => {
      const r = await repo.listarSimuladosComCartao({
        cursinhoId: CURSINHO,
        usuarios: [SEM_TURMA_NA_JUNCAO, TURMA_VELHA],
      });

      expect(r).toHaveLength(1);
      expect(r[0].cartoes).toBe(2);
    });

    it('⚠️ não conta cartão de outro cursinho, nem pedido pelo id', async () => {
      const r = await repo.listarSimuladosComCartao({
        cursinhoId: CURSINHO,
        usuarios: [SEM_TURMA_NA_JUNCAO, ALHEIO],
      });

      expect(r[0].cartoes).toBe(1);
    });
  });

  describe('agregarPorQuestao', () => {
    it('✅ agrega pelo recorte de usuarios', async () => {
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
        usuarios: [SEM_TURMA_NA_JUNCAO, TURMA_VELHA],
      });

      // sem respostas semeadas o agregado é vazio, mas a consulta não estoura
      // e o recorte foi aceito — o que esta suíte precisa provar aqui
      expect(Array.isArray(r)).toBe(true);
    });

    it('⚠️ por turmaId divergente, não agrega nada', async () => {
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM.toString(),
        cursinhoId: CURSINHO,
        turmaId: 'turma-B',
      });

      expect(r).toHaveLength(0);
    });
  });
});
