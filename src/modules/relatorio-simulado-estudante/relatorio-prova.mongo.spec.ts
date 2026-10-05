import { NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { QuestaoRepository } from '../questao/questao.repository';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

/**
 * Relatório da PROVA (tickets/034) — o agregado dos simulados dela.
 *
 * ⚠️ Mongo real: o que importa aqui é o `$in` nos filtros e no agregado, e um
 * mock provaria só que passei a lista que eu mesmo montei.
 *
 * Cenário:
 * - S1 e S2: mesmas questões (Q1, Q2). S3: Q1 e Q3 — outra composição.
 * - P_UM = {S1} · P_IGUAL = {S1, S2} · P_DIF = {S1, S3}
 * - u1 tem cartão em S1 E em S2 (a aplicação é o grão); u2 em S2; u3 em S3.
 */
describe('relatório da prova (tickets/034) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let service: RelatorioSimuladoEstudanteService;

  const CURSINHO = 'cursinho-1';
  const [Q1, Q2, Q3] = [0, 1, 2].map(() => new Types.ObjectId());
  const [S1, S2, S3] = [0, 1, 2].map(() => new Types.ObjectId());
  const [P_UM, P_IGUAL, P_DIF] = [0, 1, 2].map(() => new Types.ObjectId());

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
      providers: [
        RelatorioSimuladoEstudanteRepository,
        RelatorioSimuladoEstudanteService,
        SimuladoRepository,
        {
          provide: QuestaoRepository,
          useValue: { contadoresGlobais: async () => new Map() },
        },
      ],
    }).compile();

    service = mod.get(RelatorioSimuladoEstudanteService);
    const relModel: Model<RelatorioSimuladoEstudante> = mod.get(
      getModelToken(RelatorioSimuladoEstudante.name),
    );
    const histModel: Model<Historico> = mod.get(getModelToken(Historico.name));
    const conn: Connection = mod.get(getConnectionToken());

    const simulado = (
      _id: Types.ObjectId,
      nome: string,
      qs: Types.ObjectId[],
    ) =>
      conn.collection('simulados').insertOne({
        _id,
        nome,
        questoes: qs.map((q, i) => ({ questao: q, numero: i + 1 })),
      });
    await simulado(S1, 'Simulado Inglês', [Q1, Q2]);
    await simulado(S2, 'Simulado Espanhol', [Q1, Q2]);
    await simulado(S3, 'Simulado Outro', [Q1, Q3]);

    // O número NA PROVA difere do gravado no simulado — é ele que a aba mostra.
    const prova = (_id: Types.ObjectId, nome: string, sims: Types.ObjectId[]) =>
      conn.collection('provas').insertOne({
        _id,
        nome,
        simulados: sims,
        questoes: [
          { questao: Q1, numero: 41 },
          { questao: Q2, numero: 42 },
          { questao: Q3, numero: 43 },
        ],
      });
    await prova(P_UM, 'Prova um', [S1]);
    await prova(P_IGUAL, 'Prova igual', [S1, S2]);
    await prova(P_DIF, 'Prova diferente', [S1, S3]);

    const cartao = async (
      usuario: string,
      sim: Types.ObjectId,
      respostas: { questao: Types.ObjectId; marcou: string }[],
      geral: number,
    ) => {
      const h = await histModel.create({
        usuario,
        simulado: sim,
        status: 'completed',
        questoesRespondidas: respostas.length,
        aproveitamento: { geral, materias: [] },
        respostas: respostas.map((r, i) => ({
          questao: r.questao,
          numero: i + 1,
          alternativaEstudante: r.marcou,
          alternativaCorreta: 'A',
        })),
      });
      await relModel.create({
        historico: h._id,
        simulado: sim,
        usuario,
        cursinhoId: CURSINHO,
      });
    };

    await cartao(
      'u1',
      S1,
      [
        { questao: Q1, marcou: 'A' },
        { questao: Q2, marcou: 'B' },
      ],
      0.5,
    );
    await cartao(
      'u1',
      S2,
      [
        { questao: Q1, marcou: 'A' },
        { questao: Q2, marcou: 'A' },
      ],
      1,
    );
    await cartao(
      'u2',
      S2,
      [
        { questao: Q1, marcou: 'C' },
        { questao: Q2, marcou: 'A' },
      ],
      0.5,
    );
    await cartao(
      'u3',
      S3,
      [
        { questao: Q1, marcou: 'A' },
        { questao: Q3, marcou: 'A' },
      ],
      1,
    );
  });

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  describe('prova com um simulado só', () => {
    it('as linhas são as do relatório daquele simulado', async () => {
      const prova = await service.consultarProva({
        provaId: P_UM.toString(),
        cursinhoId: CURSINHO,
      });
      const simulado = await service.consultar({
        simuladoId: S1.toString(),
        cursinhoId: CURSINHO,
      });

      expect(prova.linhas).toEqual(simulado.linhas);
      expect(prova.totalEstudantesComCartaoNoCursinho).toBe(
        simulado.totalEstudantesComCartaoNoCursinho,
      );
      expect(prova.mesmasQuestoes).toBe(true);
      expect(prova.provaNome).toBe('Prova um');
    });

    it('a aba Questões tem os mesmos contadores, com o número da prova', async () => {
      const prova = await service.consultarQuestoesDaProva({
        provaId: P_UM.toString(),
        cursinhoId: CURSINHO,
      });
      const simulado = await service.consultarQuestoes({
        simuladoId: S1.toString(),
        cursinhoId: CURSINHO,
      });

      const semNumero = (q: { numero: number | null }) => ({ ...q, numero: 0 });
      expect(prova.questoes.map(semNumero)).toEqual(
        simulado.questoes.map(semNumero),
      );
      expect(prova.questoes.map((q) => q.numero)).toEqual([41, 42]);
      expect(simulado.questoes.map((q) => q.numero)).toEqual([1, 2]);
    });
  });

  describe('prova com dois simulados de mesma composição', () => {
    it('⚠️ u1 aparece em DUAS linhas, uma por simulado — o grão é a aplicação', async () => {
      const r = await service.consultarProva({
        provaId: P_IGUAL.toString(),
        cursinhoId: CURSINHO,
      });

      const doU1 = r.linhas.filter((l) => l.usuario === 'u1');
      expect(doU1.map((l) => l.simuladoId).sort()).toEqual(
        [S1.toString(), S2.toString()].sort(),
      );
      expect(r.linhas).toHaveLength(3);
    });

    it('o rodapé conta ESTUDANTES distintos, não linhas', async () => {
      const r = await service.consultarProva({
        provaId: P_IGUAL.toString(),
        cursinhoId: CURSINHO,
      });
      expect(r.totalEstudantesComCartaoNoCursinho).toBe(2);
    });

    it('lista os simulados com cartão, na ordem da prova, com nome e contagem', async () => {
      const r = await service.consultarProva({
        provaId: P_IGUAL.toString(),
        cursinhoId: CURSINHO,
      });
      expect(r.simulados).toEqual([
        {
          simuladoId: S1.toString(),
          nome: 'Simulado Inglês',
          cartoes: 1,
          totalDeQuestoes: 2,
        },
        {
          simuladoId: S2.toString(),
          nome: 'Simulado Espanhol',
          cartoes: 2,
          totalDeQuestoes: 2,
        },
      ]);
      expect(r.mesmasQuestoes).toBe(true);
    });

    it('a questão soma as respostas dos dois simulados', async () => {
      const r = await service.consultarQuestoesDaProva({
        provaId: P_IGUAL.toString(),
        cursinhoId: CURSINHO,
      });
      const q1 = r.questoes.find((q) => q.questaoId === Q1.toString())!;
      expect(q1).toMatchObject({
        numero: 41,
        respondentes: 3,
        acertos: 2,
        erros: 1,
      });
      expect(r.mesmasQuestoes).toBe(true);
    });

    it('o recorte por usuários vale para os dois simulados', async () => {
      const r = await service.consultarProva({
        provaId: P_IGUAL.toString(),
        cursinhoId: CURSINHO,
        usuarios: ['u2'],
      });
      expect(r.linhas.map((l) => l.usuario)).toEqual(['u2']);
      expect(r.simulados.map((s) => s.simuladoId)).toEqual([S2.toString()]);
    });
  });

  describe('prova com simulados de composições diferentes', () => {
    it('mesmasQuestoes: false', async () => {
      const r = await service.consultarProva({
        provaId: P_DIF.toString(),
        cursinhoId: CURSINHO,
      });
      expect(r.mesmasQuestoes).toBe(false);
    });

    it('⚠️ discriminação null em toda questão — notas de provas diferentes', async () => {
      const r = await service.consultarQuestoesDaProva({
        provaId: P_DIF.toString(),
        cursinhoId: CURSINHO,
      });
      expect(r.mesmasQuestoes).toBe(false);
      expect(r.questoes.every((q) => q.discriminacao === null)).toBe(true);
      expect(r.questoes.map((q) => q.numero)).toEqual([41, 42, 43]);
    });

    it('com o recorte num simulado só, as composições deixam de divergir', async () => {
      const r = await service.consultarQuestoesDaProva({
        provaId: P_DIF.toString(),
        cursinhoId: CURSINHO,
        usuarios: ['u3'],
      });
      expect(r.mesmasQuestoes).toBe(true);
    });
  });

  it('prova inexistente → 404', async () => {
    await expect(
      service.consultarProva({
        provaId: new Types.ObjectId().toString(),
        cursinhoId: CURSINHO,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('outro cursinho não vê nada da prova', async () => {
    const r = await service.consultarProva({
      provaId: P_IGUAL.toString(),
      cursinhoId: 'cursinho-2',
    });
    expect(r.linhas).toEqual([]);
    expect(r.totalEstudantesComCartaoNoCursinho).toBe(0);
    expect(r.simulados).toEqual([]);
  });
});
