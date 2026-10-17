import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Frente, FrenteSchema } from '../../frente/frente.schema';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../../historico/historico.repository';
import { Historico, HistoricoSchema } from '../../historico/historico.schema';
import { Materia, MateriaSchema } from '../../materia/materia.schema';
import { Prova, ProvaSchema } from '../../prova/prova.schema';
import { AnulacaoRepository } from '../../questao/anulacao/anulacao.repository';
import { MotivoAnulacao } from '../../questao/enums/motivo-anulacao.enum';
import { Questao, QuestaoSchema } from '../../questao/questao.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from '../relatorio-simulado-estudante.schema';
import { AvisoDoRecalculoService } from './aviso-do-recalculo.service';
import { DivergenciaRepository } from './divergencia.repository';
import {
  RecalculoAnulacao,
  RecalculoAnulacaoSchema,
  StatusDoRecalculo,
} from './recalculo-anulacao.schema';
import {
  mesDe,
  RecalculoAnulacaoService,
  STREAM_RECALCULO,
} from './recalculo-anulacao.service';
import { QueueProducer } from 'src/shared/modules/queue/queue.producer';
import { EnvService } from 'src/shared/modules/env/env.service';

/**
 * tickets/042, card 12 — divergência e recálculo em fila, contra o Mongo real.
 * A fila é um dublê que guarda o que foi publicado; o processamento é chamado
 * direto (é o que o consumer faz).
 */
describe('recálculo por anulação (042/12) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let historicos: Model<Historico>;
  let simulados: Model<Simulado>;
  let questoes: Model<Questao>;
  let linhas: Model<RelatorioSimuladoEstudante>;
  let jobs: Model<RecalculoAnulacao>;
  let provas: Model<Prova>;
  let service: RecalculoAnulacaoService;
  let divergencia: DivergenciaRepository;
  let anulacoes: AnulacaoRepository;
  const publicados: Record<string, string>[] = [];
  const avisos: any[] = [];

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `recalculo-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Frente.name, schema: FrenteSchema },
          { name: Materia.name, schema: MateriaSchema },
          { name: Prova.name, schema: ProvaSchema },
          {
            name: RelatorioSimuladoEstudante.name,
            schema: RelatorioSimuladoEstudanteSchema,
          },
          { name: RecalculoAnulacao.name, schema: RecalculoAnulacaoSchema },
        ]),
      ],
      providers: [
        RecalculoAnulacaoService,
        DivergenciaRepository,
        HistoricoRepository,
        RelatorioSimuladoEstudanteRepository,
        AnulacaoRepository,
        {
          provide: QueueProducer,
          useValue: {
            publish: async (s: string, p: Record<string, string>) => (
              publicados.push({ s, ...p }), '1'
            ),
          },
        },
        {
          provide: AvisoDoRecalculoService,
          useValue: { avisar: async (c: unknown) => (avisos.push(c), true) },
        },
        {
          provide: EnvService,
          useValue: {
            get: (k: string) => (k === 'RECALCULO_PAUSA_MS' ? 0 : undefined),
          },
        },
      ],
    }).compile();
    await mod.init();
    historicos = mod.get(getModelToken(Historico.name));
    simulados = mod.get(getModelToken(Simulado.name));
    questoes = mod.get(getModelToken(Questao.name));
    linhas = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    jobs = mod.get(getModelToken(RecalculoAnulacao.name));
    provas = mod.get(getModelToken(Prova.name));
    service = mod.get(RecalculoAnulacaoService);
    divergencia = mod.get(DivergenciaRepository);
    anulacoes = mod.get(AnulacaoRepository);
    await jobs.syncIndexes();
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(() => {
    publicados.length = 0;
    avisos.length = 0;
  });

  const anulacao = {
    motivo: MotivoAnulacao.semAlternativaCorreta,
    justificativa: 'A alternativa C está errada.',
    em: new Date(),
    porUsuarioId: 'u',
    porCursinhoId: 'c1',
  };

  /**
   * Prova com 1 simulado de `n` questões (gabarito A); `alunos` cartões do
   * cursinho c1, cada um acertando tudo; o de índice 0 é "antigo" (sem o campo
   * `revisaoAnulacao`). Mais 1 cartão de OUTRO cursinho.
   */
  async function cenario(n = 4, alunos = 3) {
    const m = (
      await mod
        .get(getModelToken(Materia.name))
        .collection.insertOne({ nome: 'Mat' })
    ).insertedId;
    const f = (
      await mod
        .get(getModelToken(Frente.name))
        .collection.insertOne({ nome: 'Álg', materia: m })
    ).insertedId;
    const ids: Types.ObjectId[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(
        (
          await questoes.collection.insertOne({
            alternativa: 'A',
            materia: m,
            frente1: f,
            acertos: 7,
            quantidadeResposta: 9,
          } as never)
        ).insertedId,
      );
    }
    const itens = ids.map((questao, i) => ({ questao, numero: i + 1 }));
    const s = (
      await simulados.collection.insertOne({
        nome: 'Simulado 3',
        questoes: itens,
      } as never)
    ).insertedId;
    const p = (
      await provas.collection.insertOne({
        nome: 'Prova X',
        questoes: itens,
        simulados: [s],
      } as never)
    ).insertedId;
    const hist: Types.ObjectId[] = [];
    const add = async (
      usuario: string,
      cursinhoId: string,
      extra: object = {},
    ) => {
      const h = (
        await historicos.collection.insertOne({
          usuario,
          simulado: s,
          status: HistoricoStatus.Completed,
          cartaoCode: usuario,
          createdAt: new Date('2026-09-15T12:00:00Z'),
          respostas: ids.map((questao, i) => ({
            questao,
            numero: i + 1,
            alternativaEstudante: 'A',
            alternativaCorreta: 'A',
          })),
          acertos: n,
          questoesRespondidas: n,
          aproveitamento: { geral: 1, materias: [] },
          ...extra,
        } as never)
      ).insertedId;
      await linhas.collection.insertOne({
        historico: h,
        simulado: s,
        usuario,
        cursinhoId,
      } as never);
      return h;
    };
    for (let a = 0; a < alunos; a++)
      hist.push(
        await add(`aluno${a}`, 'c1', a === 0 ? {} : { revisaoAnulacao: 0 }),
      );
    const deOutro = await add('outro', 'c2');
    return {
      s,
      p,
      ids,
      hist,
      deOutro,
      recorte: { simuladoIds: [String(s)], cursinhoId: 'c1' },
    };
  }

  const anular = (c: Awaited<ReturnType<typeof cenario>>, numero: number) =>
    anulacoes.gravar(
      {
        provaId: String(c.p),
        questaoId: String(c.ids[numero - 1]),
        subirRevisao: true,
      },
      anulacao,
    );

  it('anular e desanular 10 vezes → nenhum job, nenhum processamento (D6)', async () => {
    const c = await cenario();
    for (let i = 0; i < 5; i++) {
      await anular(c, 2);
      await anulacoes.limpar({
        provaId: String(c.p),
        questaoId: String(c.ids[1]),
        subirRevisao: true,
      });
    }
    expect(await jobs.countDocuments({ simuladoIds: String(c.s) })).toBe(0);
    expect(publicados).toEqual([]);
    const h = await historicos.collection.findOne({ _id: c.hist[1] });
    expect(h!.acertos).toBe(4);
  });

  it('⚠️ divergência conta o histórico SEM o campo, e só do cursinho; diz quais anulações', async () => {
    const c = await cenario();
    await anular(c, 2);
    const r = await service.situacao(c.recorte);
    expect(r.divergentes).toBe(3);
    expect(r.anulacoes).toEqual([
      {
        numero: 2,
        motivo: 'sem_alternativa_correta',
        justificativa: anulacao.justificativa,
      },
    ]);
  });

  it('sem divergência → "nada a recalcular", e nenhum job', async () => {
    const c = await cenario();
    const r = await service.solicitar(c.recorte, 'u');
    expect(r).toMatchObject({
      criado: false,
      job: null,
      mensagem: 'Nada a recalcular.',
    });
    expect(publicados).toEqual([]);
  });

  it('pedir duas vezes (ou em duas abas ao mesmo tempo) → um job só (R6)', async () => {
    const c = await cenario();
    await anular(c, 2);
    const [a, b] = await Promise.all([
      service.solicitar(c.recorte),
      service.solicitar(c.recorte),
    ]);
    const r3 = await service.solicitar(c.recorte);
    const ids = new Set([a.job!.id, b.job!.id, r3.job!.id]);
    expect(ids.size).toBe(1);
    expect(await jobs.countDocuments({ chave: { $regex: String(c.s) } })).toBe(
      1,
    );
    expect(publicados.filter((p) => p.s === STREAM_RECALCULO)).toHaveLength(1);
  });

  it('recalcula: tira a anulada, regrava com a revisão, avisa a api uma vez; a 2ª não regrava nada', async () => {
    const c = await cenario();
    await anular(c, 2);
    const { job } = await service.solicitar(c.recorte, 'coord');
    await service.processar(job!.id);

    for (const h of c.hist) {
      const doc = await historicos.collection.findOne({ _id: h });
      expect(doc).toMatchObject({
        acertos: 3,
        totalConsiderado: 3,
        numerosAnulados: [2],
        revisaoAnulacao: 1,
      });
      expect(doc!.recalculadoEm).toBeInstanceOf(Date);
    }
    // O de outro cursinho não é deste relatório.
    expect(
      (await historicos.collection.findOne({ _id: c.deOutro }))!.acertos,
    ).toBe(4);
    // D9: a estatística global da questão não muda.
    expect(await questoes.collection.findOne({ _id: c.ids[1] })).toMatchObject({
      acertos: 7,
      quantidadeResposta: 9,
    });

    const fim = await jobs.findById(job!.id).lean();
    expect(fim).toMatchObject({
      status: StatusDoRecalculo.concluido,
      total: 3,
      processados: 3,
      falhas: 0,
      numerosAnulados: [2],
    });
    expect(fim!.ativo).toBeUndefined();
    expect(fim!.avisadoEm).toBeInstanceOf(Date);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      jobId: job!.id,
      provaNome: 'Simulado 3',
      numerosAnulados: [2],
    });
    expect(avisos[0].afetados).toHaveLength(3);
    expect(avisos[0].afetados[0]).toMatchObject({ mes: '2026-09' });

    expect(await service.situacao(c.recorte)).toMatchObject({ divergentes: 0 });
    expect(await service.solicitar(c.recorte)).toMatchObject({
      criado: false,
      mensagem: 'Nada a recalcular.',
    });
  });

  it('desanular + recalcular → as notas de antes', async () => {
    const c = await cenario();
    await anular(c, 2);
    await service.processar((await service.solicitar(c.recorte)).job!.id);
    await anulacoes.limpar({
      provaId: String(c.p),
      questaoId: String(c.ids[1]),
      subirRevisao: true,
    });
    await service.processar((await service.solicitar(c.recorte)).job!.id);
    const doc = await historicos.collection.findOne({ _id: c.hist[1] });
    expect(doc).toMatchObject({
      acertos: 4,
      totalConsiderado: 4,
      numerosAnulados: [],
      revisaoAnulacao: 2,
    });
  });

  it('⚠️ anulação nova com o job no meio → segunda passada; no fim, zero divergentes', async () => {
    const c = await cenario();
    await anular(c, 2);
    const { job } = await service.solicitar(c.recorte);
    const loteReal = divergencia.lote.bind(divergencia);
    let primeira = true;
    jest.spyOn(divergencia, 'lote').mockImplementation(async (...args) => {
      const r = await loteReal(...args);
      if (primeira && r.length) {
        primeira = false;
        await anular(c, 3); // chega no meio, depois do 1º lote ser lido
      }
      return r;
    });
    await service.processar(job!.id);
    jest.restoreAllMocks();
    expect(await service.situacao(c.recorte)).toMatchObject({ divergentes: 0 });
    expect((await jobs.findById(job!.id).lean())!.passadas).toBe(2);
    expect(
      (await historicos.collection.findOne({ _id: c.hist[0] }))!
        .numerosAnulados,
    ).toEqual([2, 3]);
    // Cada aluno uma vez no aviso, mesmo regravado nas duas passadas.
    expect(avisos[0].afetados).toHaveLength(3);
  });

  it('histórico que não casa com o container conta como falha, e o job termina', async () => {
    const c = await cenario();
    await historicos.collection.updateOne(
      { _id: c.hist[1] },
      { $set: { respostas: [] } },
    );
    await anular(c, 2);
    const { job } = await service.solicitar(c.recorte);
    await service.processar(job!.id);
    const fim = await jobs.findById(job!.id).lean();
    expect(fim).toMatchObject({
      status: StatusDoRecalculo.concluido,
      falhas: 1,
      processados: 3,
    });
    expect(fim!.afetados).toHaveLength(2);
  });

  it('restart no meio: o boot republica os jobs ativos (R5)', async () => {
    const c = await cenario();
    await anular(c, 2);
    const { job } = await service.solicitar(c.recorte);
    await jobs.updateOne(
      { _id: new Types.ObjectId(job!.id) },
      { $set: { status: StatusDoRecalculo.processando } },
    );
    publicados.length = 0;
    await service.retomar();
    expect(publicados).toContainEqual({ s: STREAM_RECALCULO, jobId: job!.id });
    await service.processar(job!.id);
    expect((await jobs.findById(job!.id).lean())!.status).toBe(
      StatusDoRecalculo.concluido,
    );
  });

  it('500 históricos: lotes de 50, todos regravados', async () => {
    const c = await cenario(3, 500);
    await anular(c, 1);
    const espiao = jest.spyOn(divergencia, 'lote');
    const inicio = Date.now();
    await service.processar((await service.solicitar(c.recorte)).job!.id);
    const ms = Date.now() - inicio;
    expect(espiao.mock.calls.length).toBe(11); // 10 cheios + o vazio que encerra
    espiao.mockRestore();
    expect(await service.situacao(c.recorte)).toMatchObject({ divergentes: 0 });
    expect(ms).toBeLessThan(30000);
  }, 60000);

  it('mesDe usa o fuso de São Paulo', () => {
    expect(mesDe(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09');
    expect(mesDe(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10');
  });
});
