import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { EnvService } from 'src/shared/modules/env/env.service';
import { QueueProducer } from 'src/shared/modules/queue/queue.producer';
import { Frente, FrenteSchema } from '../../frente/frente.schema';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../../historico/historico.repository';
import { Historico, HistoricoSchema } from '../../historico/historico.schema';
import { Materia, MateriaSchema } from '../../materia/materia.schema';
import { Prova, ProvaSchema } from '../../prova/prova.schema';
import { AnulacaoRepository } from '../../questao/anulacao/anulacao.repository';
import { MotivoAnulacao } from '../../questao/enums/motivo-anulacao.enum';
import { QuestaoRepository } from '../../questao/questao.repository';
import { Questao, QuestaoSchema } from '../../questao/questao.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../../simulado/simulado.repository';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from '../relatorio-simulado-estudante.schema';
import { RelatorioSimuladoEstudanteService } from '../relatorio-simulado-estudante.service';
import { AvisoDoRecalculoService } from './aviso-do-recalculo.service';
import { DivergenciaRepository } from './divergencia.repository';
import {
  RecalculoAnulacao,
  RecalculoAnulacaoSchema,
} from './recalculo-anulacao.schema';
import { RecalculoAnulacaoService } from './recalculo-anulacao.service';
import { calcularAproveitamento } from '../../simulado/calcularAproveitamento';

/** tickets/042, card 13 — o relatório com anulada, antes e depois do recálculo. */
describe('relatório com anuladas (042/13) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let historicos: Model<Historico>;
  let simulados: Model<Simulado>;
  let questoes: Model<Questao>;
  let linhas: Model<RelatorioSimuladoEstudante>;
  let provas: Model<Prova>;
  let relatorio: RelatorioSimuladoEstudanteService;
  let recalculo: RecalculoAnulacaoService;
  let anulacoes: AnulacaoRepository;
  let materia: Types.ObjectId;
  let frente: Types.ObjectId;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `rel-anuladas-${Date.now()}` }),
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
        RelatorioSimuladoEstudanteService,
        RelatorioSimuladoEstudanteRepository,
        SimuladoRepository,
        RecalculoAnulacaoService,
        DivergenciaRepository,
        HistoricoRepository,
        AnulacaoRepository,
        {
          provide: QuestaoRepository,
          useValue: { contadoresGlobais: async () => new Map() },
        },
        { provide: QueueProducer, useValue: { publish: async () => '1' } },
        {
          provide: AvisoDoRecalculoService,
          useValue: { avisar: async () => true },
        },
        { provide: EnvService, useValue: { get: () => 0 } },
      ],
    }).compile();
    historicos = mod.get(getModelToken(Historico.name));
    simulados = mod.get(getModelToken(Simulado.name));
    questoes = mod.get(getModelToken(Questao.name));
    linhas = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    provas = mod.get(getModelToken(Prova.name));
    relatorio = mod.get(RelatorioSimuladoEstudanteService);
    recalculo = mod.get(RecalculoAnulacaoService);
    anulacoes = mod.get(AnulacaoRepository);
    await mod.get(getModelToken(RecalculoAnulacao.name)).syncIndexes();
    materia = (
      await mod
        .get(getModelToken(Materia.name))
        .collection.insertOne({ nome: 'Mat' })
    ).insertedId;
    frente = (
      await mod
        .get(getModelToken(Frente.name))
        .collection.insertOne({ nome: 'Álg', materia })
    ).insertedId;
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  /**
   * Um simulado com as questões `numeros` e 12 alunos com marcações variadas
   * (o aluno `a` acerta a questão `n` se (a + n) % 3 !== 0) — notas
   * diferentes, para a discriminação existir.
   */
  async function aplicacao(numeros: number[], cursinhoId: string) {
    const ids: Types.ObjectId[] = [];
    for (let i = 0; i < numeros.length; i++)
      ids.push(
        (
          await questoes.collection.insertOne({
            alternativa: 'A',
            materia,
            frente1: frente,
          } as never)
        ).insertedId,
      );
    const itens = ids.map((questao, i) => ({ questao, numero: numeros[i] }));
    const s = (
      await simulados.collection.insertOne({
        nome: 'Simulado 3',
        questoes: itens,
        bloqueado: false,
      } as never)
    ).insertedId;
    const p = (
      await provas.collection.insertOne({
        nome: 'Prova X',
        questoes: itens,
        simulados: [s],
      } as never)
    ).insertedId;
    for (let a = 0; a < 12; a++) {
      const respostas = itens.map((it) => ({
        questao: it.questao,
        numero: it.numero,
        alternativaEstudante: (a + it.numero) % 3 !== 0 ? 'A' : 'B',
        alternativaCorreta: 'A',
      }));
      const acertos = respostas.filter(
        (r) => r.alternativaEstudante === 'A',
      ).length;
      const ap = calcularAproveitamento(
        respostas.map((r) => ({
          questao: {
            materia: { _id: materia, nome: 'Mat' },
            frente1: {
              _id: frente,
              nome: 'Álg',
              materia: { _id: materia, nome: 'Mat' },
            },
          },
          alternativaEstudante: r.alternativaEstudante,
          alternativaCorreta: 'A',
        })) as never,
      );
      const h = (
        await historicos.collection.insertOne({
          usuario: `aluno${a}`,
          simulado: s,
          status: HistoricoStatus.Completed,
          cartaoCode: String(a),
          createdAt: new Date('2026-09-10T12:00:00Z'),
          respostas,
          acertos,
          questoesRespondidas: respostas.length,
          aproveitamento: ap,
        } as never)
      ).insertedId;
      await linhas.collection.insertOne({
        historico: h,
        simulado: s,
        usuario: `aluno${a}`,
        cursinhoId,
        createdAt: new Date('2026-09-10T12:00:00Z'),
      } as never);
    }
    return { s, p, ids, recorte: { simuladoId: String(s), cursinhoId } };
  }

  const anulacao = {
    motivo: MotivoAnulacao.semAlternativaCorreta,
    justificativa: 'Gabarito errado.',
    em: new Date(),
    porUsuarioId: 'u',
    porCursinhoId: null as string | null,
  };

  it('sem anuladas: o payload de sempre, mais os campos novos zerados', async () => {
    const c = await aplicacao([1, 2, 3, 4], 'c-sem');
    const r = await relatorio.consultar(c.recorte);
    expect(r).toMatchObject({
      totalDeQuestoes: 4,
      totalConsiderado: 4,
      anuladas: [],
      anulacao: { divergentes: 0, jobAtivo: null },
    });
    expect(r.linhas.every((l) => l.divergente === false)).toBe(true);
    const q = await relatorio.consultarQuestoes(c.recorte);
    expect(q.semDiscriminacao).toBeNull();
    expect(q.questoes.some((x) => x.anulada)).toBe(false);
  });

  it('⚠️ anulada depois da aplicação: linhas divergentes com a nota GRAVADA, discriminação null com o motivo', async () => {
    const c = await aplicacao([1, 2, 3, 4], 'c-div');
    await anulacoes.gravar(
      { provaId: String(c.p), questaoId: String(c.ids[1]), subirRevisao: true },
      anulacao,
    );

    const r = await relatorio.consultar(c.recorte);
    expect(r).toMatchObject({
      totalDeQuestoes: 4,
      totalConsiderado: 3,
      anuladas: [
        {
          numero: 2,
          motivo: 'sem_alternativa_correta',
          justificativa: 'Gabarito errado.',
        },
      ],
      anulacao: { divergentes: 12 },
    });
    expect(r.linhas.every((l) => l.divergente === true)).toBe(true);
    // A nota gravada, sem correção na hora.
    const a0 = r.linhas.find((l) => l.usuario === 'aluno0')!;
    expect(a0.acertos).toBe(3);

    const q = await relatorio.consultarQuestoes(c.recorte);
    expect(q.semDiscriminacao).toBe('divergente');
    expect(q.questoes.every((x) => x.discriminacao === null)).toBe(true);
    expect(q.questoes.find((x) => x.numero === 2)).toMatchObject({
      anulada: true,
      motivoAnulacao: 'sem_alternativa_correta',
      justificativaAnulacao: 'Gabarito errado.',
    });

    const d = await relatorio.consultarDetalhe({
      ...c.recorte,
      usuario: 'aluno0',
    });
    expect(d.divergente).toBe(true);
    expect(d.respostas.find((x) => x.numero === 2)).toMatchObject({
      anulacao: { motivo: 'sem_alternativa_correta' },
    });
    expect(d.respostas.find((x) => x.numero === 2)!.anulada).toBeUndefined();
  });

  it('⚠️ tudo recalculado: média e discriminação iguais às de uma prova sem a questão', async () => {
    const c = await aplicacao([1, 2, 3, 4], 'c-rec');
    await anulacoes.gravar(
      { provaId: String(c.p), questaoId: String(c.ids[1]), subirRevisao: true },
      anulacao,
    );
    const { job } = await recalculo.solicitar({
      simuladoIds: [String(c.s)],
      cursinhoId: 'c-rec',
    });
    await recalculo.processar(job!.id);

    // A gêmea: a mesma turma, numa prova que nunca teve a questão 2.
    const gemea = await aplicacao([1, 3, 4], 'c-gemea');

    const [r, rg] = await Promise.all([
      relatorio.consultar(c.recorte),
      relatorio.consultar(gemea.recorte),
    ]);
    expect(r.anulacao!.divergentes).toBe(0);
    expect(
      r.linhas.every((l) => l.divergente === false && l.totalConsiderado === 3),
    ).toBe(true);
    const nota = (rr: typeof r) =>
      rr.linhas
        .map((l) => [l.usuario, l.acertos, l.aproveitamentoGeral])
        .sort();
    expect(nota(r)).toEqual(nota(rg));

    const [q, qg] = await Promise.all([
      relatorio.consultarQuestoes(c.recorte),
      relatorio.consultarQuestoes(gemea.recorte),
    ]);
    expect(q.semDiscriminacao).toBeNull();
    const disc = (qq: typeof q) =>
      qq.questoes
        .filter((x) => !x.anulada)
        .map((x) => [x.numero, x.discriminacao]);
    expect(disc(q)).toEqual(disc(qg));
    expect(disc(q).some(([, v]) => v !== null)).toBe(true);
    // A anulada continua na tabela, fora da análise.
    expect(q.questoes.find((x) => x.numero === 2)).toMatchObject({
      anulada: true,
      discriminacao: null,
    });

    const d = await relatorio.consultarDetalhe({
      ...c.recorte,
      usuario: 'aluno0',
    });
    expect(d).toMatchObject({
      divergente: false,
      totalConsiderado: 3,
      numerosAnulados: [2],
    });
    expect(d.respostas.find((x) => x.numero === 2)!.anulada).toBe(true);

    const serie = await relatorio.serieDoEstudante({
      cursinhoId: 'c-rec',
      usuario: 'aluno0',
    });
    expect(serie.pontos[0].totalConsiderado).toBe(3);
  });

  it('relatório da prova: total considerado no resumo e por simulado', async () => {
    const c = await aplicacao([1, 2, 3, 4], 'c-prova');
    await anulacoes.gravar(
      { provaId: String(c.p), questaoId: String(c.ids[3]), subirRevisao: true },
      anulacao,
    );
    const r = await relatorio.consultarProva({
      provaId: String(c.p),
      cursinhoId: 'c-prova',
    });
    expect(r).toMatchObject({
      totalDeQuestoes: 4,
      totalConsiderado: 3,
      anulacao: { divergentes: 12 },
    });
    expect(r.simulados[0]).toMatchObject({
      totalDeQuestoes: 4,
      totalConsiderado: 3,
    });
    const q = await relatorio.consultarQuestoesDaProva({
      provaId: String(c.p),
      cursinhoId: 'c-prova',
    });
    expect(q.semDiscriminacao).toBe('divergente');
    expect(q.questoes.find((x) => x.numero === 4)!.anulada).toBe(true);
  });
});
