import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { UserGroupAggregateRepository } from './user-group-aggregate.repository';
import {
  UserGroupAggregate,
  UserGroupAggregateSchema,
} from './user-group-aggregate.schema';

/**
 * O card 01: a aba "Desempenho em Simulados" da turma descartava **todo**
 * simulado respondido por cartão-resposta.
 *
 * O filtro era `size(respostas) == questoesRespondidas`, e `questoesRespondidas`
 * só tinha escritores do fluxo digital (`answer` → `createPending`). O caminho
 * do cartão — `createAwaitingOmr` → `prepararParaProcessamento` →
 * `completeProcessing` — nunca gravava o campo, e no Mongo
 * `{ $eq: [90, undefined] }` é `false`. O radar de matéria e a evolução mensal
 * ficavam cegos, em silêncio, para exatamente os dados da feature nova.
 *
 * ⚠️ Mongo real, e não dublê: o defeito vive no `$match` da agregação. Um mock
 * do `aggregate` provaria só que passei o objeto que eu mesmo montei — que é
 * justamente o objeto errado.
 */
describe('agregado da turma × cartão-resposta (card 01) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: UserGroupAggregateRepository;
  let histModel: Model<Historico>;

  const MATERIA = new Types.ObjectId();
  const FRENTE = new Types.ObjectId();

  const DIGITAL = 'u-digital';
  const CARTAO = 'u-cartao';
  const INCOMPLETO = 'u-incompleto';

  const INICIO = new Date('2026-09-01T00:00:00.000Z');
  const FIM = new Date('2026-09-30T23:59:59.999Z');
  const DENTRO_DO_MES = new Date('2026-09-15T12:00:00.000Z');

  /**
   * Um histórico com aproveitamento por matéria/frente — que é o que o agregado
   * desdobra. `questoesRespondidas` fica de fora por padrão de propósito: é
   * assim que o cartão gravava antes deste card.
   */
  function historico(over: Partial<Record<string, unknown>>) {
    return {
      usuario: 'u',
      ano: 2026,
      simulado: new Types.ObjectId(),
      respostas: [{ questao: new Types.ObjectId() }],
      aproveitamento: {
        geral: 0.8,
        materias: [
          {
            id: MATERIA,
            nome: 'Matemática',
            aproveitamento: 0.8,
            frentes: [
              {
                id: FRENTE,
                nome: 'Aritmética',
                materia: String(MATERIA),
                aproveitamento: 0.8,
              },
            ],
          },
        ],
      },
      createdAt: DENTRO_DO_MES,
      updatedAt: DENTRO_DO_MES,
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
          { name: UserGroupAggregate.name, schema: UserGroupAggregateSchema },
        ]),
      ],
      providers: [UserGroupAggregateRepository],
    }).compile();

    repo = mod.get(UserGroupAggregateRepository);
    histModel = mod.get(getModelToken(Historico.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await histModel.deleteMany({});
  });

  async function agregar(userIds: string[]) {
    const { payload } = await repo.aggregateMonth({
      userIds,
      monthStart: INICIO,
      monthEnd: FIM,
    });
    return payload;
  }

  it('⚠️ conta o cartão-resposta, que NÃO grava `questoesRespondidas`', async () => {
    // O defeito relatado, na sua forma mínima: o histórico está `completed`,
    // tem aproveitamento por frente, e mesmo assim não chegava ao radar.
    await histModel.create(
      historico({
        usuario: CARTAO,
        status: HistoricoStatus.Completed,
        cartaoCode: '7',
      }),
    );

    const payload = await agregar([CARTAO]);

    expect(payload.totalAttemptsCompleted).toBe(1);
    expect(payload.studentsWithAtLeastOneCompletedAttempt).toBe(1);
    expect(payload.materias).toHaveLength(1);
  });

  it('⚠️ cartão com questão não lida também conta — leitura parcial não é tentativa inválida', async () => {
    // No digital, responder menos que o total é escolha do aluno. No cartão,
    // uma marcação fraca ou uma dobra na folha derruba questão sem que ninguém
    // decida nada. Exigir 100% de leitura descartaria a tentativa inteira, e o
    // coordenador não teria como saber por quê.
    await histModel.create(
      historico({
        usuario: CARTAO,
        status: HistoricoStatus.Completed,
        respostas: [
          { questao: new Types.ObjectId() },
          { questao: new Types.ObjectId() },
          { questao: new Types.ObjectId() },
        ],
        questoesRespondidas: 1,
      }),
    );

    const payload = await agregar([CARTAO]);

    expect(payload.totalAttemptsCompleted).toBe(1);
  });

  it('o digital completo continua contando', async () => {
    await histModel.create(
      historico({
        usuario: DIGITAL,
        status: HistoricoStatus.Completed,
        questoesRespondidas: 1,
      }),
    );

    const payload = await agregar([DIGITAL]);

    expect(payload.totalAttemptsCompleted).toBe(1);
    expect(payload.materias[0].frentes[0].aproveitamento).toBeCloseTo(0.8);
  });

  it('⚠️ tentativa que NÃO terminou fica de fora', async () => {
    // O gate não sumiu, mudou de campo: quem decide é o `status`. Um histórico
    // `pending` tem `aproveitamento` ausente e entraria no radar como zero.
    await histModel.create(
      historico({
        usuario: INCOMPLETO,
        status: HistoricoStatus.Pending,
        aproveitamento: undefined,
      }),
    );

    const payload = await agregar([INCOMPLETO]);

    expect(payload.totalAttemptsCompleted).toBe(0);
    expect(payload.materias).toHaveLength(0);
    // ⚠️ Mas segue contando como TENTATIVA: é disso que sai a taxa de conclusão.
    expect(payload.totalAttempts).toBe(1);
  });

  it('⚠️ cartão que FALHOU na leitura fica de fora', async () => {
    // `failed` carrega aproveitamento velho quando a falha veio depois de uma
    // leitura boa (o `marcarFalha` não limpa o campo). Contar seria publicar
    // nota de uma tentativa que a tela recusa mostrar.
    await histModel.create(
      historico({
        usuario: CARTAO,
        status: HistoricoStatus.Failed,
        falha: { codigo: 'motor_timeout', descricao: 'A leitura excedeu' },
      }),
    );

    const payload = await agregar([CARTAO]);

    expect(payload.totalAttemptsCompleted).toBe(0);
  });

  it('cartão aguardando o OMR fica de fora', async () => {
    await histModel.create(
      historico({
        usuario: CARTAO,
        status: HistoricoStatus.AwaitingOmr,
        aproveitamento: undefined,
      }),
    );

    expect((await agregar([CARTAO])).totalAttemptsCompleted).toBe(0);
  });

  it('cartão e digital do mesmo mês somam no mesmo radar', async () => {
    await histModel.create(
      historico({
        usuario: CARTAO,
        status: HistoricoStatus.Completed,
        cartaoCode: '7',
      }),
    );
    await histModel.create(
      historico({
        usuario: DIGITAL,
        status: HistoricoStatus.Completed,
        questoesRespondidas: 1,
      }),
    );

    const payload = await agregar([CARTAO, DIGITAL]);

    expect(payload.totalAttemptsCompleted).toBe(2);
    expect(payload.studentsWithAtLeastOneCompletedAttempt).toBe(2);
    expect(payload.materias[0].frentes[0].studentsContributing).toBe(2);
  });
});
