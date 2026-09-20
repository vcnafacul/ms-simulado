import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

const SIM_A = new Types.ObjectId();
const SIM_B = new Types.ObjectId();
// hoisteado: o bloco HTTP (describe irmão) também precisa dele para provar
// a rota `:simuladoId/questoes` contra o MESMO seed desta suíte.
const SIM_C = new Types.ObjectId();

describe('RelatorioSimuladoEstudante — isolamento (Mongo real em memória)', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let uri: string;
  let repo: RelatorioSimuladoEstudanteRepository;
  let relModel: Model<RelatorioSimuladoEstudante>;
  let histModel: Model<Historico>;
  let simuladoModel: Model<Simulado>;
  let svc: RelatorioSimuladoEstudanteService;

  beforeAll(async () => {
    // O CI já sobe um `mongo:7` como service container (ci-homol.yml) — usar
    // esse em vez de baixar +141MB de `mongod` do `mongodb-memory-server` a
    // cada run. Localmente, sem a env var, cai no memory server de sempre.
    uri =
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
        SimuladoRepository,
        RelatorioSimuladoEstudanteService,
      ],
    }).compile();

    repo = mod.get(RelatorioSimuladoEstudanteRepository);
    relModel = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    histModel = mod.get(getModelToken(Historico.name));
    simuladoModel = mod.get(getModelToken(Simulado.name));
    // real, ligado ao mesmo repositório e ao mesmo Mongo desta suíte — é o que
    // prova o `numero` de ponta a ponta (Fix 2 da revisão adversarial); ver o
    // bloco "agregado por questão" abaixo.
    svc = mod.get(RelatorioSimuladoEstudanteService);

    const semear = async (
      simulado: Types.ObjectId,
      cursinhoId: string,
      usuario: string,
      turmaId?: string,
      extra: Partial<Pick<Historico, 'cartaoCode' | 'falha'>> = {},
    ) => {
      const h = await histModel.create({
        usuario,
        simulado,
        status: 'completed',
        questoesRespondidas: 90,
        aproveitamento: { geral: 0.5, materias: [] },
        ...extra,
      });
      await relModel.create({
        historico: h._id,
        simulado,
        usuario,
        cursinhoId,
        turmaId,
      });
    };

    // cartaoCode e falha só em u-a1: é o histórico que o teste do `select`
    // (linha ~140) usa para provar os 5 campos, não só 3.
    await semear(SIM_A, 'cur-1', 'u-a1', 't-1', {
      cartaoCode: '42',
      falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
    });
    await semear(SIM_A, 'cur-1', 'u-a2', 't-2');
    await semear(SIM_A, 'cur-1', 'u-a3'); // sem turma
    await semear(SIM_A, 'cur-2', 'u-b1', 't-9'); // outro cursinho
    await semear(SIM_B, 'cur-1', 'u-c1', 't-1'); // outro simulado
  }, 120_000);

  afterAll(async () => {
    await mod.close();
    // só para quem a gente subiu — o `mongo:7` do CI é do CI, não nosso
    if (mongo) {
      await mongo.stop();
    }
  });

  it('não vaza entre cursinhos', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2', 'u-a3']);
  });

  it('não vaza entre simulados', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_B.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-c1']);
  });

  it('turmaId restringe à turma', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-a1']);
  });

  it('sem turmaId, vêm TODOS: com turma e sem turma', async () => {
    // reintroduzir o bug faz esta asserção cair: o filtro {turmaId: null}
    // devolveria só 'u-a3'
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    const comTurma = r.filter((l) => l.turmaId !== undefined);
    const semTurma = r.filter((l) => l.turmaId === undefined);
    expect(comTurma.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2']);
    expect(semTurma.map((l) => l.usuario)).toEqual(['u-a3']);
  });

  it('o populate traz o histórico, com os campos certos e sem as respostas', async () => {
    // o `select` é uma string: um typo nele passa em todo teste com dublê.
    // As 5 asserções de campo cobrem os 5 nomes de CAMPOS_DO_HISTORICO —
    // mutar o select para tirar `cartaoCode` ou `falha` tem que deixar
    // exatamente uma delas vermelha.
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r[0].historico.status).toBe('completed');
    expect(r[0].historico.cartaoCode).toBe('42');
    expect(r[0].historico.questoesRespondidas).toBe(90);
    expect(r[0].historico.aproveitamento.geral).toBe(0.5);
    expect(r[0].historico.falha).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'sem CSV',
    });
    expect((r[0].historico as any).respostas).toBeUndefined();
  });

  it('vem ordenado por usuário, não na ordem natural do Mongo', async () => {
    // insere fora de ordem alfabética num simulado só desta linha, pra não
    // depender da ordem de inserção do `beforeAll` coincidir com a esperada
    const SIM_ORDEM = new Types.ObjectId();
    for (const usuario of ['u-zebra', 'u-abacate', 'u-melancia']) {
      const h = await histModel.create({
        usuario,
        simulado: SIM_ORDEM,
        status: 'completed',
      });
      await relModel.create({
        historico: h._id,
        simulado: SIM_ORDEM,
        usuario,
        cursinhoId: 'cur-1',
      });
    }

    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_ORDEM.toString(),
      cursinhoId: 'cur-1',
    });

    expect(r.map((l) => l.usuario)).toEqual([
      'u-abacate',
      'u-melancia',
      'u-zebra',
    ]);
  });

  it('a contagem é do cursinho, não global', async () => {
    // cur-2 também tem cartão em SIM_A; ele não pode entrar na conta
    const total = await repo.contarDoCursinho(SIM_A.toString(), 'cur-1');
    expect(total).toBe(3);
  });

  describe('agregado por questão (Mongo real)', () => {
    // Três estudantes do cur-1 em SIM_C: q1 → 2 acertos e 1 sem leitura;
    // q2 → 1 acerto, 1 erro, 1 sem leitura. Mais um histórico FAILED, que não vota.
    const Q1 = new Types.ObjectId();
    const Q2 = new Types.ObjectId();

    beforeAll(async () => {
      const comRespostas = async (
        usuario: string,
        cursinhoId: string,
        respostas: any[] | undefined,
        status = 'completed',
      ) => {
        const h = await histModel.create({
          usuario,
          simulado: SIM_C,
          status,
          respostas,
        });
        await relModel.create({
          historico: h._id,
          simulado: SIM_C,
          usuario,
          cursinhoId,
        });
      };

      await comRespostas('u-1', 'cur-1', [
        { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
        { questao: Q2, alternativaEstudante: 'B', alternativaCorreta: 'B' },
      ]);
      await comRespostas('u-2', 'cur-1', [
        { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
        { questao: Q2, alternativaEstudante: 'C', alternativaCorreta: 'B' },
      ]);
      // em branco: a chave `alternativaEstudante` simplesmente não existe
      await comRespostas('u-3', 'cur-1', [
        { questao: Q1, alternativaCorreta: 'A' },
        { questao: Q2, alternativaCorreta: 'B' },
      ]);
      // outro cursinho, não pode entrar na conta
      await comRespostas('u-4', 'cur-2', [
        { questao: Q1, alternativaEstudante: 'E', alternativaCorreta: 'A' },
      ]);
      // failed: sem `respostas`, não vota em questão nenhuma
      await comRespostas('u-5', 'cur-1', undefined, 'failed');
      // reprocessou e falhou: o marcarFalha NÃO limpa `respostas`, então as
      // respostas velhas ficam no documento
      await comRespostas(
        'u-6',
        'cur-1',
        [{ questao: Q1, alternativaEstudante: 'B', alternativaCorreta: 'A' }],
        'failed',
      );
      // em reprocessamento: o prepararParaProcessamento também não limpa
      await comRespostas(
        'u-7',
        'cur-1',
        [{ questao: Q1, alternativaEstudante: 'C', alternativaCorreta: 'A' }],
        'pending',
      );

      // cur-3, dedicado só a este seed: nem cur-1 (asserções principais) nem
      // cur-2 (controle negativo do "não vaza entre cursinhos") o veem, então
      // este histórico não pode mudar o número de nenhum outro teste do bloco.
      //
      // DOCUMENTA o comportamento atual, não o desejado: uma questão duplicada
      // no simulado gera duas linhas de resposta no mesmo Historico, e a
      // contagem é por LINHA, não por estudante.
      await comRespostas('u-8', 'cur-3', [
        { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
        { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
      ]);

      // Fix 2 da revisão adversarial: a junção só guarda o id da questão — sem
      // um Simulado real para cruzar, `getNumerosDasQuestoes` devolve `[]` e
      // todo `numero` sai `null` "por acidente", mascarando um mutante em
      // `qc.questao?.toString()` (troca por `qc.questao` sem `.toString()`).
      await simuladoModel.create({
        _id: SIM_C,
        nome: 'Simulado C',
        descricao: 'agregado por questão',
        questoes: [
          { questao: Q1, numero: 7 },
          { questao: Q2, numero: 8 },
        ],
      });
    }, 120_000);

    it('conta acertos, erros e sem-leitura por questão', async () => {
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      const q1 = r.find((q) => q.questaoId === Q1.toString())!;
      const q2 = r.find((q) => q.questaoId === Q2.toString())!;

      expect(q1).toMatchObject({
        respondentes: 3,
        acertos: 2,
        erros: 0,
        semLeitura: 1,
      });
      expect(q2).toMatchObject({
        respondentes: 3,
        acertos: 1,
        erros: 1,
        semLeitura: 1,
      });
    });

    it('acertos + erros + semLeitura === respondentes, em toda questão', async () => {
      // a invariante que pega um $cond errado — por isso os três são contados
      // independentes, e não um derivado dos outros
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      expect(r).toHaveLength(2);
      for (const q of r) {
        expect(q.acertos + q.erros + q.semLeitura).toBe(q.respondentes);
      }
    });

    it('a distribuição por alternativa bate, e cobre A–E', async () => {
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      const q2 = r.find((q) => q.questaoId === Q2.toString())!;
      expect(q2.porAlternativa).toEqual({ A: 0, B: 1, C: 1, D: 0, E: 0 });
    });

    it('histórico failed não vira respondente de nada', async () => {
      // com preserveNullAndEmptyArrays no $unwind, u-5 apareceria em toda questão
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      for (const q of r) {
        expect(q.respondentes).toBe(3); // u-1, u-2, u-3 — nunca 4
      }
    });

    it('não vaza entre cursinhos', async () => {
      // u-4 marcou E em Q1 pelo cur-2; não pode aparecer na conta do cur-1
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      expect(
        r.find((q) => q.questaoId === Q1.toString())!.porAlternativa.E,
      ).toBe(0);
    });

    it('só histórico completed vota — failed e pending com respostas velhas não', async () => {
      // marcarFalha e prepararParaProcessamento NÃO limpam `respostas`: sem um
      // filtro de status, um cartão que falhou no reprocessamento seria contado
      // para sempre
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      const q1 = r.find((q) => q.questaoId === Q1.toString())!;

      expect(q1.respondentes).toBe(3); // u-1, u-2, u-3 — nunca u-6 nem u-7
      expect(q1.erros).toBe(0);
    });

    it('o número da questão vem do Simulado e chega na resposta', async () => {
      // a junção só guarda o id da questão; sem esta ligação o relatório fala
      // de "questão 65f3a…" em vez de "questão 7"
      const r = await svc.consultarQuestoes({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });

      expect(r.questoes.map((q) => q.numero)).toEqual([7, 8]);
      expect(r.questoes[0].questaoId).toBe(Q1.toString());
    });

    it('DOCUMENTA: linha duplicada conta duas vezes — a contagem é por linha, não por estudante', async () => {
      // Não é o comportamento desejado. A causa é uma corrida no adicionarEmProva
      // (docs/cards/etapa-11/BUG-corrida-no-adicionar-questao-em-prova.md), que
      // põe a mesma questão duas vezes no simulado; o processAnswer então emite
      // duas linhas. A decisão foi consertar a causa, não blindar a agregação.
      //
      // Se algum dia a agregação passar a contar históricos distintos, este teste
      // vai ficar vermelho — e aí ele é que está desatualizado, não o código.
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-3',
      });
      const q1 = r.find((q) => q.questaoId === Q1.toString())!;

      expect(q1.respondentes).toBe(2); // um estudante só, duas linhas
      expect(q1.acertos).toBe(2);
    });

    it('recorte sem cartão devolve lista vazia, não erro', async () => {
      const r = await repo.agregarPorQuestao({
        simuladoId: new Types.ObjectId().toString(),
        cursinhoId: 'cur-1',
      });
      expect(r).toEqual([]);
    });
  });

  describe('buscarDetalheDoEstudante (Mongo real)', () => {
    const SIM_D = new Types.ObjectId();
    const Q1 = new Types.ObjectId();
    const Q2 = new Types.ObjectId();
    const Q3 = new Types.ObjectId();

    beforeAll(async () => {
      const h = await histModel.create({
        usuario: 'u-det',
        simulado: SIM_D,
        status: 'completed',
        respostas: [
          { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
          { questao: Q2, alternativaEstudante: 'B', alternativaCorreta: 'C' },
          // ⚠️ sem `alternativaEstudante`: é assim que "sem leitura" chega —
          // a CHAVE não existe. Não é null, não é string vazia. Medido no 03.
          { questao: Q3, alternativaCorreta: 'D' },
        ],
      });
      await relModel.create({
        historico: h._id,
        simulado: SIM_D,
        usuario: 'u-det',
        cursinhoId: 'cur-det',
        turmaId: 't-det',
      });
    }, 120_000);

    it('devolve as respostas do estudante, com o gabarito junto', async () => {
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-det',
      });

      expect(r!.historico!.respostas).toHaveLength(3);
      expect(r!.historico!.respostas[0].alternativaCorreta).toBe('A');
      expect(r!.historico!.respostas[0].alternativaEstudante).toBe('A');
      // o `select` é uma string: sem `status` no CAMPOS_DO_DETALHE a service
      // não sabe distinguir cartão lido de cartão falho
      expect(r!.historico!.status).toBe('completed');
    });

    it('⚠️ estudante de OUTRO cursinho não é encontrado — o filtro é o gate', async () => {
      // não há checagem separada a esquecer: a leitura indexada já não acha
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-alheio',
        usuario: 'u-det',
      });

      expect(r).toBeNull();
    });

    it('usuário que não está no recorte devolve null', async () => {
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-que-nao-existe',
      });

      expect(r).toBeNull();
    });

    it('outro simulado do mesmo estudante não é encontrado', async () => {
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: new Types.ObjectId().toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-det',
      });

      expect(r).toBeNull();
    });

    it('⚠️ a resposta sem leitura NÃO tem a chave alternativaEstudante', async () => {
      // é o que distingue "não marcou / OMR não leu" de "marcou errado", e a
      // classificação do serviço depende disso
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-det',
      });

      const semLeitura = r!.historico!.respostas[2];
      expect('alternativaEstudante' in semLeitura).toBe(false);
      expect(semLeitura.alternativaEstudante).toBeUndefined();
      expect(semLeitura.alternativaCorreta).toBe('D');
    });
  });

  /**
   * Fix 4 da revisão adversarial: o spec do controller usa um dublê do
   * serviço, e os specs acima falam com o repositório direto. Nada até aqui
   * prova o `@Query()` binding, a `ValidationPipe`, a montagem do DTO pelo
   * `whitelist` e a serialização JSON de ponta a ponta — é isso que este
   * bloco cobre, com o MESMO Mongo (real ou em memória) desta suíte.
   */
  describe('HTTP: controller → service → repositório → Mongo', () => {
    let app: INestApplication;
    let httpMod: TestingModule;
    const SIM_HTTP = new Types.ObjectId();

    beforeAll(async () => {
      // histórico completo, com falha — prova `historicoId` string e `falha`
      // descrita na resposta.
      const hComFalha = await histModel.create({
        usuario: 'u-http-falha',
        simulado: SIM_HTTP,
        status: 'failed',
        falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
      });
      await relModel.create({
        historico: hComFalha._id,
        simulado: SIM_HTTP,
        usuario: 'u-http-falha',
        cursinhoId: 'cur-http',
      });

      // histórico NUNCA lido — sem `aproveitamento` nenhum. É o caso que
      // prova que a chave some do JSON, não vira `null`/`0`.
      const hNuncaLido = await histModel.create({
        usuario: 'u-http-nao-lido',
        simulado: SIM_HTTP,
        status: 'awaiting_omr',
      });
      await relModel.create({
        historico: hNuncaLido._id,
        simulado: SIM_HTTP,
        usuario: 'u-http-nao-lido',
        cursinhoId: 'cur-http',
      });

      httpMod = await Test.createTestingModule({
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
        controllers: [RelatorioSimuladoEstudanteController],
        providers: [
          RelatorioSimuladoEstudanteRepository,
          RelatorioSimuladoEstudanteService,
          SimuladoRepository,
        ],
      }).compile();

      app = httpMod.createNestApplication();
      // A MESMA pipe que `src/main.ts` registra primeiro — senão o teste
      // prova um comportamento que a app de verdade não tem.
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
        }),
      );
      await app.init();
    }, 120_000);

    afterAll(async () => {
      await app.close();
      await httpMod.close();
    });

    it('200 — historicoId é string, falha vem descrita, e o total do rodapé aparece', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}`)
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      const linhaComFalha = res.body.linhas.find(
        (l: any) => l.usuario === 'u-http-falha',
      );
      expect(typeof linhaComFalha.historicoId).toBe('string');
      expect(linhaComFalha.falha).toEqual(
        expect.objectContaining({
          codigo: 'cartao_nao_detectado',
          descricao: expect.stringContaining(
            'Não foi possível localizar o cartão',
          ),
        }),
      );
      expect(res.body.totalEstudantesComCartaoNoCursinho).toBe(2);
    });

    it('400 — sem cursinhoId, a rota recusa em vez de devolver "todos os cursinhos"', async () => {
      await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}`)
        .expect(400);
    });

    it('400 — :simuladoId que não é ObjectId', async () => {
      // sem a validação (Fix 5), `new Types.ObjectId('nao-e-objectid')` no
      // repositório lança `BSONError` e a rota responde 500
      await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/nao-e-objectid')
        .query({ cursinhoId: 'cur-http' })
        .expect(400);
    });

    it('a chave aproveitamentoGeral SOME do JSON quando o cartão nunca foi lido', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}`)
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      const linhaNaoLida = res.body.linhas.find(
        (l: any) => l.usuario === 'u-http-nao-lido',
      );
      expect('aproveitamentoGeral' in linhaNaoLida).toBe(false);
    });

    it('GET :simuladoId/questoes responde 200 com o agregado', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_C.toString()}/questoes`)
        .query({ cursinhoId: 'cur-1' })
        .expect(200);

      // não só a forma: o conteúdo, ponta a ponta — Simulado real seedado no
      // bloco irmão (SIM_C, questão 7 = Q1, 3 respondentes)
      expect(res.body.questoes[0]).toMatchObject({
        numero: 7,
        respondentes: 3,
      });
    });
  });
});
