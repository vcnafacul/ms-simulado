import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { HistoricoStatus } from './enums/historico-status.enum';
import { HistoricoRepository } from './historico.repository';
import { Historico, HistoricoSchema } from './historico.schema';

/**
 * O card 01, parte de plataforma: os contadores de admin sofriam do mesmo
 * defeito do agregado da turma. `entityCompleted` e `aggregateByPeriod`
 * contavam "completo" por `size(respostas) == questoesRespondidas`, e o campo
 * só tem escritores do fluxo digital — todo cartão-resposta caía na coluna
 * "incompletos", e o erro crescia junto com a adoção da feature.
 *
 * ⚠️ Mongo real: os três contadores são pipelines de agregação. Um dublê do
 * `aggregate` devolveria o que eu mandasse devolver.
 */
describe('contadores de plataforma × cartão-resposta (card 01) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: HistoricoRepository;
  let histModel: Model<Historico>;

  /** ⚠️ `aggregateByPeriod` deriva a data do `_id`, não de `createdAt`. */
  const EM_MARCO = new Date('2026-03-10T12:00:00.000Z');

  function historico(over: Partial<Record<string, unknown>>) {
    return {
      _id: Types.ObjectId.createFromTime(EM_MARCO.getTime() / 1000),
      usuario: 'u',
      ano: 2026,
      simulado: new Types.ObjectId(),
      respostas: [{ questao: new Types.ObjectId() }],
      ...over,
    };
  }

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [HistoricoRepository],
    }).compile();

    repo = mod.get(HistoricoRepository);
    histModel = mod.get(getModelToken(Historico.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await histModel.deleteMany({});
  });

  describe('entityCompleted', () => {
    it('⚠️ conta o cartão-resposta, que não grava `questoesRespondidas`', async () => {
      await histModel.create(
        historico({ status: HistoricoStatus.Completed, cartaoCode: '7' }),
      );

      expect(await repo.entityCompleted()).toBe(1);
    });

    it('não conta tentativa que ainda não terminou', async () => {
      await histModel.create(historico({ status: HistoricoStatus.Pending }));
      await histModel.create(
        historico({
          _id: new Types.ObjectId(),
          status: HistoricoStatus.AwaitingOmr,
        }),
      );

      expect(await repo.entityCompleted()).toBe(0);
    });

    it('não conta cartão que falhou na leitura', async () => {
      await histModel.create(historico({ status: HistoricoStatus.Failed }));

      expect(await repo.entityCompleted()).toBe(0);
    });

    it('⚠️ base vazia devolve 0, e não estoura', async () => {
      // O `result[0].total` de antes dava TypeError quando NENHUM histórico
      // casava com o filtro — o `$count` não emite linha para conjunto vazio.
      // Com o filtro antigo isso era raro; com um filtro por status, uma base
      // recém-criada (ou só com cartão pendente) cai direto nesse caminho.
      expect(await repo.entityCompleted()).toBe(0);
    });
  });

  describe('completeProcessing', () => {
    it('⚠️ grava `questoesRespondidas` — o fluxo do cartão não gravava', async () => {
      // O campo deixou de ser gate dos agregados, mas é ele que responde
      // "leu 87 de 90" na tela. Aqui contra Mongo real porque o `findByIdAndUpdate`
      // ignora em silêncio campo que não está no schema.
      const criado = await histModel.create(
        historico({ status: HistoricoStatus.AwaitingOmr }),
      );

      await repo.completeProcessing(String(criado._id), {
        ano: 2026,
        simulado: new Types.ObjectId(),
        respostas: [{}, {}, {}],
        aproveitamento: { geral: 0.5, materias: [] },
        questoesRespondidas: 2,
      });

      const salvo = await histModel.findById(criado._id).lean();
      expect(salvo?.questoesRespondidas).toBe(2);
      expect(salvo?.status).toBe(HistoricoStatus.Completed);
    });
  });

  describe('aggregateByPeriod', () => {
    async function completosDoMes() {
      const serie = await repo.aggregateByPeriod({ groupBy: 'month' } as any);
      return serie.find((p: any) => p.period === '2026-03');
    }

    it('⚠️ o cartão entra em "completos", e não em "incompletos"', async () => {
      await histModel.create(
        historico({ status: HistoricoStatus.Completed, cartaoCode: '7' }),
      );

      const mes = await completosDoMes();
      expect(mes).toMatchObject({ total: 1, completos: 1, incompletos: 0 });
    });

    it('tentativa não terminada segue em "incompletos"', async () => {
      await histModel.create(historico({ status: HistoricoStatus.Pending }));

      const mes = await completosDoMes();
      expect(mes).toMatchObject({ total: 1, completos: 0, incompletos: 1 });
    });

    it('⚠️ completos + incompletos fecha o total', async () => {
      // As duas somas são ramos do mesmo `$cond`; se uma mudar sem a outra, a
      // barra empilhada do dashboard passa a mentir sem parecer errada.
      await histModel.create(
        historico({ status: HistoricoStatus.Completed, cartaoCode: '7' }),
      );
      await histModel.create(
        historico({
          _id: new Types.ObjectId(),
          status: HistoricoStatus.Failed,
        }),
      );
      await histModel.create(
        historico({
          _id: new Types.ObjectId(),
          status: HistoricoStatus.Pending,
        }),
      );

      const serie = await repo.aggregateByPeriod({ groupBy: 'month' } as any);
      const soma = serie.reduce(
        (acc: any, p: any) => ({
          total: acc.total + p.total,
          completos: acc.completos + p.completos,
          incompletos: acc.incompletos + p.incompletos,
        }),
        { total: 0, completos: 0, incompletos: 0 },
      );

      expect(soma.total).toBe(3);
      expect(soma.completos + soma.incompletos).toBe(soma.total);
      expect(soma.completos).toBe(1);
    });
  });
});
