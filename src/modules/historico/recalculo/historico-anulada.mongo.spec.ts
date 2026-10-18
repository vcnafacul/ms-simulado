import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Frente, FrenteSchema } from '../../frente/frente.schema';
import { Materia, MateriaSchema } from '../../materia/materia.schema';
import { Questao, QuestaoSchema } from '../../questao/questao.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { HistoricoStatus } from '../enums/historico-status.enum';
import { HistoricoRepository } from '../historico.repository';
import { Historico, HistoricoSchema } from '../historico.schema';
import { HistoricoService } from '../historico.service';

/**
 * tickets/042, card 10 — o histórico do aluno com anulada, e o D11 (recalcular
 * o DIGITAL ao abrir), contra o Mongo real.
 */
describe('histórico com anulada (042/10) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let historicos: Model<Historico>;
  let simulados: Model<Simulado>;
  let questoes: Model<Questao>;
  let repo: HistoricoRepository;
  let service: HistoricoService;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `hist-anulada-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Frente.name, schema: FrenteSchema },
          { name: Materia.name, schema: MateriaSchema },
        ]),
      ],
      providers: [HistoricoRepository, HistoricoService],
    }).compile();
    historicos = mod.get(getModelToken(Historico.name));
    simulados = mod.get(getModelToken(Simulado.name));
    questoes = mod.get(getModelToken(Questao.name));
    repo = mod.get(HistoricoRepository);
    service = mod.get(HistoricoService);
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  /** 3 questões (1, 2, 3); a 2 anulada no simulado (revisão 1). Aluno acertou as 3. */
  async function cenario(
    o: {
      cartao?: boolean;
      revisaoDoHistorico?: number;
      numerosDoHistorico?: number[];
      /** Card 20: a 2 foi anulada e desanulada (revisão 2, nada anulado). */
      desanulada?: boolean;
    } = {},
  ) {
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
    for (let i = 0; i < 3; i++) {
      ids.push(
        (
          await questoes.collection.insertOne({
            alternativa: 'A',
            materia: m,
            frente1: f,
          } as never)
        ).insertedId,
      );
    }
    const anulacao = {
      motivo: 'sem_alternativa_correta',
      justificativa: 'Gabarito errado.',
      em: new Date(),
    };
    const s = (
      await simulados.collection.insertOne({
        nome: 'S',
        revisaoAnulacao: o.desanulada ? 2 : 1,
        questoes: ids.map((questao, i) => ({
          questao,
          numero: i + 1,
          ...(i === 1 && !o.desanulada ? { anulacao } : {}),
        })),
      } as never)
    ).insertedId;
    const h = (
      await historicos.collection.insertOne({
        usuario: 'aluno',
        simulado: s,
        status: HistoricoStatus.Completed,
        ...(o.cartao ? { cartaoCode: '001' } : {}),
        ...(o.revisaoDoHistorico !== undefined
          ? { revisaoAnulacao: o.revisaoDoHistorico }
          : {}),
        ...(o.numerosDoHistorico
          ? { numerosAnulados: o.numerosDoHistorico }
          : {}),
        respostas: ids.map((questao, i) => ({
          questao,
          numero: i + 1,
          alternativaEstudante: 'A',
          alternativaCorreta: 'A',
        })),
        acertos: 3,
        questoesRespondidas: 3,
        aproveitamento: { geral: 1, materias: [] },
      } as never)
    ).insertedId;
    return { s, h };
  }

  it('⚠️ D11: digital divergente (histórico antigo, sem o campo) é recalculado ao abrir', async () => {
    const { h } = await cenario();
    const r = await service.getById(String(h), 'aluno');
    expect(r).toMatchObject({
      divergente: false,
      acertos: 2,
      totalConsiderado: 2,
      numerosAnulados: [2],
      revisaoAnulacao: 1,
    });
    expect(r.aproveitamento.geral).toBe(1);
    expect(r.recalculadoEm).toBeInstanceOf(Date);
    expect(r.simulado.questoes[1]).toMatchObject({
      anulada: true,
      anulacao: {
        motivo: 'sem_alternativa_correta',
        justificativa: 'Gabarito errado.',
      },
    });
    expect(r.simulado.questoes[0].anulada).toBe(false);
  });

  it('cartão divergente NÃO é recalculado ao abrir: espera o relatório (D6)', async () => {
    const { h } = await cenario({ cartao: true, revisaoDoHistorico: 0 });
    const r = await service.getById(String(h), 'aluno');
    expect(r).toMatchObject({ divergente: true, acertos: 3 });
    expect(r.recalculadoEm).toBeUndefined();
  });

  it('em dia (mesmas anuladas) → não divergente, nada é regravado', async () => {
    const { h } = await cenario({
      revisaoDoHistorico: 1,
      numerosDoHistorico: [2],
    });
    const r = await service.getById(String(h), 'aluno');
    expect(r).toMatchObject({ divergente: false, acertos: 3 });
    expect(r.recalculadoEm).toBeUndefined();
  });

  it('card 20: anulada e desanulada sem recálculo → não divergente, nada é regravado', async () => {
    // Histórico de antes da anulação (sem os campos); simulado na revisão 2.
    const { h } = await cenario({ desanulada: true });
    const r = await service.getById(String(h), 'aluno');
    expect(r).toMatchObject({ divergente: false, acertos: 3 });
    expect(r.recalculadoEm).toBeUndefined();
  });

  it('card 20: recalculado com a anulada e depois desanulada → divergente de novo', async () => {
    const { h } = await cenario({
      desanulada: true,
      revisaoDoHistorico: 1,
      numerosDoHistorico: [2],
    });
    const r = await service.getById(String(h), 'aluno');
    // Digital: recalcula ao abrir e volta a contar a 2.
    expect(r).toMatchObject({
      divergente: false,
      totalConsiderado: 3,
      numerosAnulados: [],
      revisaoAnulacao: 2,
    });
    expect(r.recalculadoEm).toBeInstanceOf(Date);
  });

  it('regravarRecalculo é condicional: só concluído e atrás do alvo', async () => {
    const { h } = await cenario();
    expect(
      await repo.regravarRecalculo(String(h), 1, {
        acertos: 2,
        revisaoAnulacao: 1,
      }),
    ).toBe(true);
    // A segunda não pega: já está na revisão 1.
    expect(
      await repo.regravarRecalculo(String(h), 1, {
        acertos: 9,
        revisaoAnulacao: 1,
      }),
    ).toBe(false);
    await historicos.collection.updateOne(
      { _id: h },
      { $set: { status: HistoricoStatus.Processing } },
    );
    expect(
      await repo.regravarRecalculo(String(h), 2, {
        acertos: 9,
        revisaoAnulacao: 2,
      }),
    ).toBe(false);
    expect((await historicos.collection.findOne({ _id: h }))!.acertos).toBe(2);
  });
});
