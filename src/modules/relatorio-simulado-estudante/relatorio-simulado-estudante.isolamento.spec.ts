import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao, QuestaoSchema } from '../questao/questao.schema';
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
          /*
            ⚠️ Entraram no card 16: `consultarQuestoes` passou a ler os
            contadores GLOBAIS da `Questao`. O `QuestaoRepository` abaixo é o
            REAL, contra o mesmo Mongo em memória — é o que prova o campo de
            ponta a ponta, do documento até o DTO.
          */
          { name: Questao.name, schema: QuestaoSchema },
          { name: Prova.name, schema: ProvaSchema },
        ]),
      ],
      providers: [
        RelatorioSimuladoEstudanteRepository,
        SimuladoRepository,
        QuestaoRepository,
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

  describe('número da questão gravado no histórico (Mongo real)', () => {
    /*
      O caso da nova versão (card 26): os cartões responderam a ORIGINAL como
      questão 7; depois a questão foi versionada e o simulado passou a apontar
      a SUCESSORA no lugar dela. O histórico continua apontando a original —
      que não está mais no `Simulado.questoes`, e por isso saía sem número.
    */
    const SIM_V = new Types.ObjectId();
    const ORIGINAL = new Types.ObjectId();
    const SUCESSORA = new Types.ObjectId();
    const LEGADA = new Types.ObjectId();

    beforeAll(async () => {
      const cartao = async (usuario: string, respostas: any[]) => {
        const h = await histModel.create({
          usuario,
          simulado: SIM_V,
          status: 'completed',
          respostas,
        });
        await relModel.create({
          historico: h._id,
          simulado: SIM_V,
          usuario,
          cursinhoId: 'cur-v',
        });
      };

      await cartao('u-v1', [
        {
          questao: ORIGINAL,
          numero: 7,
          alternativaEstudante: 'A',
          alternativaCorreta: 'A',
        },
        // histórico processado antes do campo existir: sem `numero`
        { questao: LEGADA, alternativaEstudante: 'B', alternativaCorreta: 'B' },
      ]);

      await simuladoModel.create({
        _id: SIM_V,
        nome: 'Simulado versionado',
        questoes: [
          { questao: SUCESSORA, numero: 7 },
          { questao: LEGADA, numero: 8 },
        ],
      });
    }, 120_000);

    it('⚠️ a questão versionada mantém o número com que foi respondida', async () => {
      const r = await svc.consultarQuestoes({
        simuladoId: SIM_V.toString(),
        cursinhoId: 'cur-v',
      });

      const original = r.questoes.find(
        (q) => q.questaoId === ORIGINAL.toString(),
      );
      expect(original?.numero).toBe(7);
    });

    it('sem número gravado, cai para o número atual no simulado', async () => {
      const r = await svc.consultarQuestoes({
        simuladoId: SIM_V.toString(),
        cursinhoId: 'cur-v',
      });

      const legada = r.questoes.find((q) => q.questaoId === LEGADA.toString());
      expect(legada?.numero).toBe(8);
    });

    it('⚠️ no detalhe do estudante também', async () => {
      const r = await svc.consultarDetalhe({
        simuladoId: SIM_V.toString(),
        cursinhoId: 'cur-v',
        usuario: 'u-v1',
      });

      expect(r.respostas.map((x) => [x.questaoId, x.numero])).toEqual([
        [ORIGINAL.toString(), 7],
        [LEGADA.toString(), 8],
      ]);
    });
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

    /**
     * O card 03: as cinco colunas de alternativa da aba de Questões não são
     * interpretáveis sem o gabarito. "51% marcaram B" é a turma acertando em
     * peso ou meia turma caindo no mesmo distrator — leituras opostas, e a
     * tela não permitia escolher entre elas.
     *
     * ⚠️ O valor sai do HISTÓRICO, nunca de `Questao.alternativa`: é o gabarito
     * que VALEU naquela aplicação, que é a pergunta certa quando a questão foi
     * editada depois. E `Questao.alternativa` é `select: false` — trazê-lo
     * abriria um caminho de leitura de gabarito onde hoje não existe nenhum.
     */
    it('devolve a alternativa correta de cada questão', async () => {
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });

      expect(
        r.find((q) => q.questaoId === Q1.toString())!.alternativaCorreta,
      ).toBe('A');
      expect(
        r.find((q) => q.questaoId === Q2.toString())!.alternativaCorreta,
      ).toBe('B');
    });

    it('⚠️ INVARIANTE: `porAlternativa[correta] === acertos`', async () => {
      // Se o gabarito devolvido não for o mesmo que a agregação usou para
      // contar `acertos`, esta igualdade quebra. É o teste que liga o campo
      // novo aos números que já existiam, em vez de afirmá-lo isolado.
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });

      expect(r).toHaveLength(2);
      for (const q of r) {
        expect(q.porAlternativa[q.alternativaCorreta!]).toBe(q.acertos);
      }
    });

    it('⚠️ só o histórico COMPLETED define o gabarito', async () => {
      // u-6 (`failed`) e u-7 (`pending`) carregam `alternativaCorreta: 'A'` em
      // Q1 — igual aos completos, então este teste não distingue nada sozinho.
      // O que ele trava é que o campo passa pelo MESMO `$match` dos outros: se
      // o gabarito fosse coletado antes do filtro de status, um reprocessamento
      // com gabarito novo mandaria a divergência para dentro do grupo.
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });
      const q1 = r.find((q) => q.questaoId === Q1.toString())!;

      expect(q1.respondentes).toBe(3);
      expect(q1.alternativaCorreta).toBe('A');
    });
  });

  /**
   * O caso patológico do card 03, isolado no seu próprio cursinho para não
   * mexer em nenhum número dos testes acima.
   *
   * ⚠️ **Não é hipotético.** `docs/cards/etapa-11/` registra a corrida do
   * `adicionarEmProva` que permite a mesma questão entrar duas vezes num
   * simulado; e uma questão editada entre duas aplicações do mesmo simulado
   * produz históricos com gabaritos diferentes. Enquanto isso for possível,
   * `$first` é um chute que ninguém vê.
   */
  describe('agregado por questão — gabaritos divergentes (card 03)', () => {
    const SIM_G = new Types.ObjectId();
    const Q_DIVERGE = new Types.ObjectId();
    const Q_OK = new Types.ObjectId();

    beforeAll(async () => {
      const com = async (usuario: string, respostas: any[]) => {
        const h = await histModel.create({
          usuario,
          simulado: SIM_G,
          status: 'completed',
          respostas,
        });
        await relModel.create({
          historico: h._id,
          simulado: SIM_G,
          usuario,
          cursinhoId: 'cur-gab',
        });
      };

      // A questão foi editada entre as duas aplicações: o gabarito era 'A' e
      // virou 'D'. Cada histórico guardou o que valia na hora.
      await com('g-1', [
        {
          questao: Q_DIVERGE,
          alternativaEstudante: 'A',
          alternativaCorreta: 'A',
        },
        { questao: Q_OK, alternativaEstudante: 'C', alternativaCorreta: 'C' },
      ]);
      await com('g-2', [
        {
          questao: Q_DIVERGE,
          alternativaEstudante: 'D',
          alternativaCorreta: 'D',
        },
        { questao: Q_OK, alternativaEstudante: 'B', alternativaCorreta: 'C' },
      ]);
      /*
        Histórico antigo: a resposta existe e o gabarito não foi copiado.
        Ausência não é divergência — ver o `filter(Boolean)` do `gabaritoUnico`.

        ⚠️ **Os dois casos, e eles NÃO são equivalentes** — medido no Mongo:
        `$addToSet` IGNORA caminho ausente e INCLUI `null` explícito. Um seed
        só com a chave faltando deixaria o `filter(Boolean)` sem exercício
        nenhum, e a mutação que o remove sobreviveria.
      */
      await com('g-3', [{ questao: Q_OK, alternativaEstudante: 'C' }]);
      await com('g-4', [
        { questao: Q_OK, alternativaEstudante: 'C', alternativaCorreta: null },
      ]);
    }, 120_000);

    it('⚠️ devolve `null` em vez de escolher um dos dois gabaritos', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_G.toString(),
        cursinhoId: 'cur-gab',
      });

      expect(
        r.find((q) => q.questaoId === Q_DIVERGE.toString())!.alternativaCorreta,
      ).toBeNull();
      error.mockRestore();
    });

    it('⚠️ e LOGA — divergência silenciosa é pior que campo vazio', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await repo.agregarPorQuestao({
        simuladoId: SIM_G.toString(),
        cursinhoId: 'cur-gab',
      });

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(Q_DIVERGE.toString()),
      );
      error.mockRestore();
    });

    it('⚠️ resposta SEM gabarito copiado não conta como divergência', async () => {
      // O `$addToSet` inclui `null` quando a chave falta (histórico antigo).
      // Tratá-lo como uma "segunda letra" apagaria o gabarito bom da questão
      // inteira — a ausência de um vira a perda da informação de todos.
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_G.toString(),
        cursinhoId: 'cur-gab',
      });
      const q = r.find((x) => x.questaoId === Q_OK.toString())!;

      expect(q.respondentes).toBe(4);
      expect(q.alternativaCorreta).toBe('C');
      error.mockRestore();
    });

    it('a divergência de uma questão NÃO contamina as outras', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_G.toString(),
        cursinhoId: 'cur-gab',
      });

      expect(
        r.find((q) => q.questaoId === Q_OK.toString())!.alternativaCorreta,
      ).toBe('C');
      error.mockRestore();
    });

    it('⚠️ com gabarito divergente os acertos seguem CERTOS', async () => {
      // A conta de `acertos` compara campo com campo dentro da mesma linha, e
      // por isso é imune à divergência: g-1 acertou por 'A' e g-2 por 'D'. O
      // que se perde é só a capacidade de dizer QUAL é a correta — e é
      // exatamente isso que o `null` comunica.
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_G.toString(),
        cursinhoId: 'cur-gab',
      });
      const q = r.find((x) => x.questaoId === Q_DIVERGE.toString())!;

      expect(q).toMatchObject({ respondentes: 2, acertos: 2, erros: 0 });
      error.mockRestore();
    });
  });

  /**
   * O card 05: a discriminação sai na MESMA passada da agregação, e não numa
   * consulta nova — duas consultas sobre o mesmo recorte podem ver estados
   * diferentes se um cartão terminar de processar entre elas, e o relatório
   * mostraria dificuldade de uma foto e discriminação de outra.
   *
   * ⚠️ Mongo real: o que se testa aqui é se os ACUMULADORES saem certos do
   * `$group`. A fórmula em si tem seu próprio spec, com valores conferidos à
   * mão (`discriminacao.spec.ts`).
   */
  describe('discriminação por questão (card 05) — Mongo real', () => {
    const SIM_D = new Types.ObjectId();
    /** Só os melhores acertam: discriminação positiva alta. */
    const Q_BOA = new Types.ObjectId();
    /** Só os piores acertam: NEGATIVA — o sinal de gabarito trocado. */
    const Q_TROCADA = new Types.ObjectId();
    /** Todos acertam: variância do item zero. */
    const Q_FACIL = new Types.ObjectId();
    /**
     * Metade não foi lida — e quem não foi lido NÃO entra na correlação.
     *
     * ⚠️ Sem esta questão no seed, a decisão de usar `comLeitura` em vez de
     * `respondentes` não fica travada por teste nenhum: a mutação que troca o
     * denominador sobrevive, porque nenhuma outra questão do seed tem
     * sem-leitura.
     */
    const Q_MEIA_LIDA = new Types.ObjectId();

    beforeAll(async () => {
      // Dez estudantes com notas 1,0 a 0,1 — os mesmos do `discriminacao.spec`.
      const notas = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

      for (const [i, nota] of notas.entries()) {
        const bom = i < 5;
        const h = await histModel.create({
          usuario: `d-${i}`,
          simulado: SIM_D,
          status: 'completed',
          aproveitamento: { geral: nota, materias: [] },
          respostas: [
            {
              questao: Q_BOA,
              alternativaEstudante: bom ? 'A' : 'B',
              alternativaCorreta: 'A',
            },
            {
              questao: Q_TROCADA,
              alternativaEstudante: bom ? 'B' : 'A',
              alternativaCorreta: 'A',
            },
            {
              questao: Q_FACIL,
              alternativaEstudante: 'A',
              alternativaCorreta: 'A',
            },
            /*
              Os 10 primeiros pares de notas viram 5 lidos + 5 não lidos: quem
              tem índice par teve leitura (e acerta se for dos melhores), quem
              tem índice ímpar chega SEM a chave `alternativaEstudante`.

              São 5 com leitura — abaixo do mínimo de 10 —, então esta questão
              devolve `null` pela BASE. Se `respondentes` fosse o denominador,
              seriam 10 e o número sairia.
            */
            i % 2 === 0
              ? {
                  questao: Q_MEIA_LIDA,
                  alternativaEstudante: bom ? 'A' : 'B',
                  alternativaCorreta: 'A',
                }
              : { questao: Q_MEIA_LIDA, alternativaCorreta: 'A' },
          ],
        });
        await relModel.create({
          historico: h._id,
          simulado: SIM_D,
          usuario: `d-${i}`,
          cursinhoId: 'cur-disc',
        });
      }
    }, 120_000);

    async function doRecorte() {
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-disc',
      });
      return (q: Types.ObjectId) =>
        r.find((x) => x.questaoId === q.toString())!;
    }

    it('⚠️ questão que só os melhores acertam: 0,870388', async () => {
      // O mesmo número do `discriminacao.spec.ts`, agora saindo do Mongo. É
      // isto que liga a fórmula testada aos acumuladores da agregação — cada
      // um verde sozinho não prova que estão conectados.
      const q = await doRecorte();

      expect(q(Q_BOA).discriminacao).toBeCloseTo(0.870388, 6);
    });

    it('⚠️ questão que só os PIORES acertam dá negativo — gabarito trocado', async () => {
      const q = await doRecorte();

      expect(q(Q_TROCADA).discriminacao).toBeCloseTo(-0.870388, 6);
    });

    it('⚠️ questão que todos acertam devolve `null`, e não `NaN`', async () => {
      const q = await doRecorte();

      expect(q(Q_FACIL).discriminacao).toBeNull();
      // e os acertos seguem certos — o `null` é só da discriminação
      expect(q(Q_FACIL).acertos).toBe(10);
    });

    it('⚠️ quem NÃO foi lido não entra na base da correlação', async () => {
      // 10 respondentes, mas só 5 com leitura — abaixo do mínimo, então `null`.
      // Se o denominador fosse `respondentes`, o número sairia: quem não foi
      // lido entraria como se tivesse errado, e a questão seria punida pela
      // qualidade da foto em vez de pela própria qualidade.
      const q = await doRecorte();

      expect(q(Q_MEIA_LIDA).respondentes).toBe(10);
      expect(q(Q_MEIA_LIDA).semLeitura).toBe(5);
      expect(q(Q_MEIA_LIDA).discriminacao).toBeNull();
    });

    it('⚠️ recorte pequeno devolve `null` — o seed principal tem 3 estudantes', async () => {
      // `SIM_C` tem 3 com leitura. Correlação sobre 3 é ruído com cara de
      // estatística, e o professor não tem como saber olhando "0,71".
      const r = await repo.agregarPorQuestao({
        simuladoId: SIM_C.toString(),
        cursinhoId: 'cur-1',
      });

      for (const questao of r) {
        expect(questao.discriminacao).toBeNull();
      }
    });

    it('⚠️ UMA passada de agregação — sem consulta extra', async () => {
      // O card pede explicitamente. Se a discriminação virasse uma segunda
      // consulta, um cartão que terminasse de processar no meio faria a tela
      // mostrar dificuldade de uma foto e discriminação de outra.
      const spy = jest.spyOn(relModel, 'aggregate');

      await repo.agregarPorQuestao({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-disc',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe('listarSimuladosComCartao (Mongo real)', () => {
    const SIM_L1 = new Types.ObjectId();
    const SIM_L2 = new Types.ObjectId();
    // terceiro simulado, com `createdAt` ENTRE os outros dois: com apenas dois,
    // a ordem natural do `$group` coincidia com a esperada e apagar o `$sort`
    // inteiro não deixava nada vermelho.
    const SIM_L3 = new Types.ObjectId();
    const CUR = 'cur-lista';
    const NOME_L1 = 'Simulado L1 — ENEM 2026';

    // `createdAt` explícito, e não a ordem de inserção: o default do
    // `BaseSchema` é `now()`, e três `create` seguidos podem cair no MESMO
    // milissegundo — aí a ordenação vira sorte e o teste, flaky.
    const T_L1 = new Date('2026-01-10T12:00:00.000Z');
    const T_L3 = new Date('2026-02-10T12:00:00.000Z');
    const T_L2 = new Date('2026-03-10T12:00:00.000Z');

    beforeAll(async () => {
      // SIM_L1: três estudantes. Um completo, um falho, e um cuja ref de
      // histórico vai ser apagada — os três ENVIARAM cartão.
      const hOk = await histModel.create({
        usuario: 'u-l1',
        simulado: SIM_L1,
        status: 'completed',
      });
      const hFalhou = await histModel.create({
        usuario: 'u-l2',
        simulado: SIM_L1,
        status: 'failed',
        falha: { codigo: 'cartao_nao_detectado' },
      });
      const hOrfao = await histModel.create({
        usuario: 'u-l3',
        simulado: SIM_L1,
        status: 'completed',
      });

      await relModel.create({
        historico: hOk._id,
        simulado: SIM_L1,
        usuario: 'u-l1',
        cursinhoId: CUR,
        turmaId: 't-A',
        createdAt: T_L1,
      });
      await relModel.create({
        historico: hFalhou._id,
        simulado: SIM_L1,
        usuario: 'u-l2',
        cursinhoId: CUR,
        turmaId: 't-B',
        createdAt: T_L1,
      });
      await relModel.create({
        historico: hOrfao._id,
        simulado: SIM_L1,
        usuario: 'u-l3',
        cursinhoId: CUR,
        turmaId: 't-A',
        createdAt: T_L1,
      });
      // a ref morre DEPOIS do vínculo — é o caso que o repositório já tipa
      // como `historico: Historico | null`
      await histModel.deleteOne({ _id: hOrfao._id });

      // SIM_L2: um estudante só, e mais recente que o SIM_L1
      const hOutro = await histModel.create({
        usuario: 'u-l4',
        simulado: SIM_L2,
        status: 'completed',
      });
      await relModel.create({
        historico: hOutro._id,
        simulado: SIM_L2,
        usuario: 'u-l4',
        cursinhoId: CUR,
        turmaId: 't-A',
        createdAt: T_L2,
      });

      // SIM_L3: no MEIO da ordenação. Existe só para que o `$sort` tenha três
      // posições para acertar — com duas, a ordem natural do `$group` acertava
      // por acaso.
      const hMeio = await histModel.create({
        usuario: 'u-l5',
        simulado: SIM_L3,
        status: 'completed',
      });
      await relModel.create({
        historico: hMeio._id,
        simulado: SIM_L3,
        usuario: 'u-l5',
        cursinhoId: CUR,
        turmaId: 't-A',
        createdAt: T_L3,
      });

      // de OUTRO cursinho, no mesmo simulado — não pode aparecer
      const hAlheio = await histModel.create({
        usuario: 'u-alheio',
        simulado: SIM_L1,
        status: 'completed',
      });
      await relModel.create({
        historico: hAlheio._id,
        simulado: SIM_L1,
        usuario: 'u-alheio',
        cursinhoId: 'cur-outro',
      });

      // ⚠️ SÓ o SIM_L1 vira documento de `Simulado`. O SIM_L2 fica de fora de
      // propósito: é ele que prova que um simulado sem documento continua na
      // lista, com `nome: null`. Não seedar o SIM_L2.
      await simuladoModel.create({
        _id: SIM_L1,
        nome: NOME_L1,
        descricao: 'lista de simulados com cartão',
        questoes: [],
      });
    }, 120_000);

    it('conta cartões enviados e, à parte, os com leitura concluída', async () => {
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      const l1 = r.find((s) => s.simuladoId === SIM_L1.toString());
      // três enviaram: completo, falho e órfão
      expect(l1!.cartoes).toBe(3);
      // só o completo conta — o falho e o órfão não
      expect(l1!.comLeituraConcluida).toBe(1);

      // ⚠️ SIM_L1 tem exatamente 1 completo e 1 falho, então `completed` e
      // `failed` dão a MESMA resposta ali — a asserção acima não distingue os
      // dois predicados. SIM_L2 tem 1 completo e 0 falhos, e distingue.
      const l2 = r.find((s) => s.simuladoId === SIM_L2.toString());
      expect(l2!.comLeituraConcluida).toBe(1);
    });

    it('o nome vem do Simulado, por Map — e não de um $lookup', async () => {
      // ⚠️ Sem isto, `getNomesPorIds` inteiro pode virar `return []` e nada
      // fica vermelho: o único outro teste dele mocka o SimuladoRepository.
      // O que se prova aqui é a conversão de `$in` para ObjectId, a projeção
      // e a chave de junção `_id.toString()` — tudo contra Mongo de verdade.
      const r = await svc.listarSimulados({ cursinhoId: CUR });

      const l1 = r.simulados.find((s) => s.simuladoId === SIM_L1.toString());
      expect(l1!.nome).toBe(NOME_L1);
    });

    it('simulado sem documento continua na lista, com nome nulo', async () => {
      // SIM_L2 não foi seedado como Simulado — os cartões existem e não podem
      // sumir por causa disso.
      const r = await svc.listarSimulados({ cursinhoId: CUR });

      const l2 = r.simulados.find((s) => s.simuladoId === SIM_L2.toString());
      expect(l2).toBeDefined();
      expect(l2!.nome).toBeNull();
    });

    it('linha cuja ref de histórico morreu CONTINUA contando como cartão enviado', async () => {
      // sem `preserveNullAndEmptyArrays`, o $unwind descarta essa linha e o
      // total passa a ser menor que o número de cartões que chegaram — sem
      // nada acusar. O repositório já tipa `historico: Historico | null`
      // justamente porque essa órfã existe.
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      expect(r.find((s) => s.simuladoId === SIM_L1.toString())!.cartoes).toBe(
        3,
      );
    });

    it('turmaId restringe à turma', async () => {
      const r = await repo.listarSimuladosComCartao({
        cursinhoId: CUR,
        turmaId: 't-A',
      });

      // u-l1 e u-l3 são da turma A; u-l2 é da B
      expect(r.find((s) => s.simuladoId === SIM_L1.toString())!.cartoes).toBe(
        2,
      );
    });

    it('simulado de outro cursinho não aparece, e o alheio não soma no meu', async () => {
      const r = await repo.listarSimuladosComCartao({
        cursinhoId: 'cur-outro',
      });

      expect(r).toHaveLength(1);
      expect(r[0].cartoes).toBe(1);
    });

    it('ordena por ultimoEnvio decrescente', async () => {
      // ⚠️ TRÊS simulados, não dois. Com dois, a ordem natural do `$group`
      // coincidia com a esperada e apagar o estágio `$sort` inteiro passava.
      // Os `createdAt` são explícitos justamente para que a posição do meio
      // seja uma afirmação, e não sorte.
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      expect(r.map((s) => s.simuladoId)).toEqual([
        SIM_L2.toString(),
        SIM_L3.toString(),
        SIM_L1.toString(),
      ]);
    });

    it('ultimoEnvio é preenchido mesmo quando a linha nasce pelo upsert do registrar', async () => {
      // ⚠️ O schema da junção é `timestamps: false`; `createdAt` vem do
      // `BaseSchema` com default. O `registrar` escreve por UPSERT, e se o
      // default não fosse aplicado no insert a ordenação inteira viraria nula
      // em produção — e passaria nos testes acima, que usam `create`.
      const SIM_UP = new Types.ObjectId();
      const h = await histModel.create({
        usuario: 'u-up',
        simulado: SIM_UP,
        status: 'completed',
      });
      await repo.registrar({
        historicoId: h._id.toString(),
        simuladoId: SIM_UP.toString(),
        usuario: 'u-up',
        cursinhoId: 'cur-upsert',
      });

      const r = await repo.listarSimuladosComCartao({
        cursinhoId: 'cur-upsert',
      });

      expect(r[0].ultimoEnvio).toBeInstanceOf(Date);
    });

    it('recorte sem nenhum cartão devolve lista vazia, não erro', async () => {
      await expect(
        repo.listarSimuladosComCartao({ cursinhoId: 'cur-que-nao-existe' }),
      ).resolves.toEqual([]);
    });

    it('turmaId ausente NÃO vira filtro por turma nula', async () => {
      // `{turmaId: undefined}` serializa para `{turmaId: null}` e casaria só
      // quem não tem turma — lição medida no card 02. Todos os do CUR têm
      // turma, então um filtro indevido devolveria lista vazia.
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      expect(r.length).toBeGreaterThan(0);
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

  describe('buscarPorHistorico (Mongo real)', () => {
    const SIM_R = new Types.ObjectId();
    let histId: string;

    beforeAll(async () => {
      const h = await histModel.create({
        usuario: 'u-rep',
        simulado: SIM_R,
        status: 'failed',
        falha: { codigo: 'cartao_nao_detectado' },
      });
      histId = h._id.toString();
      await relModel.create({
        historico: h._id,
        simulado: SIM_R,
        usuario: 'u-rep',
        cursinhoId: 'cur-rep',
      });
    }, 120_000);

    it('acha a linha pelo histórico, dentro do cursinho', async () => {
      const r = await repo.buscarPorHistorico(histId, 'cur-rep');

      expect(r!.usuario).toBe('u-rep');
    });

    it('⚠️ histórico de OUTRO cursinho não é encontrado — o filtro é o gate', async () => {
      const r = await repo.buscarPorHistorico(histId, 'cur-alheio');

      expect(r).toBeNull();
    });

    it('histórico que não existe devolve null', async () => {
      const r = await repo.buscarPorHistorico(
        new Types.ObjectId().toString(),
        'cur-rep',
      );

      expect(r).toBeNull();
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

      /*
        ⚠️ Card 17: a série só tem ponto com leitura CONCLUÍDA, então o bloco
        precisou de um estudante assim — os dois acima são `failed` e
        `awaiting_omr`, e é justamente por isso que eles NÃO viram ponto.
      */
      const hLido = await histModel.create({
        usuario: 'u-http-serie',
        simulado: SIM_HTTP,
        status: 'completed',
        acertos: 45,
        aproveitamento: { geral: 0.5, materias: [] },
      });
      await relModel.create({
        historico: hLido._id,
        simulado: SIM_HTTP,
        usuario: 'u-http-serie',
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
            // ⚠️ Card 16 — ver o módulo principal desta suíte.
            { name: Questao.name, schema: QuestaoSchema },
            { name: Prova.name, schema: ProvaSchema },
          ]),
        ],
        controllers: [RelatorioSimuladoEstudanteController],
        providers: [
          RelatorioSimuladoEstudanteRepository,
          RelatorioSimuladoEstudanteService,
          SimuladoRepository,
          QuestaoRepository,
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
      /*
        ⚠️ **Três, e não dois, desde o card 17:** o bloco ganhou um terceiro
        estudante (`u-http-serie`, com leitura concluída) porque a série só tem
        ponto com leitura concluída — e os outros dois são `failed` e
        `awaiting_omr`.

        O número subiu porque a contagem está CERTA: ela conta cartões do
        cursinho, e agora há três. Ajustar o teste aqui é o correto; o que seria
        errado é o contador ignorar o cartão novo.
      */
      expect(res.body.totalEstudantesComCartaoNoCursinho).toBe(3);
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

    it('GET /simulados resolve para a rota literal, não para :simuladoId', async () => {
      // ⚠️ `simulados` e `:simuladoId` têm a MESMA contagem de segmentos.
      // Declarada depois, a literal é capturada pelo param, `isValid` recusa
      // e isto vira 400. Só um app de verdade pega — teste de unidade chama
      // o método direto e passa com a ordem errada.
      const res = await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/simulados')
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      expect(Array.isArray(res.body.simulados)).toBe(true);
      expect(res.body.simulados[0]).toMatchObject({
        simuladoId: expect.any(String),
        cartoes: expect.any(Number),
        comLeituraConcluida: expect.any(Number),
      });
    });

    it('⚠️ GET serie/estudante/:usuario resolve para a rota literal, não para :simuladoId', async () => {
      /*
        ⚠️ **Esta é a armadilha do card 17, e só um app de verdade a pega.**
        `serie/estudante/:usuario` e `:simuladoId/estudante/:usuario` têm TRÊS
        segmentos, e o segundo é `estudante` nas duas. Declarada depois, esta
        rota seria capturada por aquela com `simuladoId = 'serie'`, o `isValid`
        recusaria e a chamada viraria **400** — sem pista nenhuma.

        Teste de unidade chama o método direto e passa com a ordem errada.
      */
      const res = await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/serie/estudante/u-http')
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      expect(Array.isArray(res.body.pontos)).toBe(true);
    });

    it('a série traz o ponto do estudante com a média do recorte junto', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/serie/estudante/u-http-serie')
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      expect(res.body.pontos[0]).toMatchObject({
        simuladoId: expect.any(String),
        aproveitamento: expect.any(Number),
        em: expect.any(String),
        baseDoRecorte: expect.any(Number),
      });
    });

    it('estudante de outro cursinho devolve série vazia, não a de outro', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/serie/estudante/u-http-serie')
        .query({ cursinhoId: 'cur-de-outro' })
        .expect(200);

      expect(res.body.pontos).toEqual([]);
    });

    it('GET /simulados sem cursinhoId recusa com 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/simulados')
        .expect(400);
    });

    it('GET :simuladoId/estudante/:usuario responde 200 com as respostas', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/v1/relatorio-simulado/${SIM_HTTP.toString()}/estudante/u-http-falha`,
        )
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      expect(res.body.status).toBe('failed');
      expect(res.body.falha).toEqual(
        expect.objectContaining({ descricao: expect.any(String) }),
      );
    });

    it('⚠️ estudante de outro cursinho dá 404, não 200 com vazio', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/v1/relatorio-simulado/${SIM_HTTP.toString()}/estudante/u-http-falha`,
        )
        .query({ cursinhoId: 'cur-alheio' })
        .expect(404);

      // ⚠️ a mensagem, não só o código: o 404 de rota inexistente do Nest
      // ('Cannot GET /v1/…') também é 404, e deixaria este teste verde por
      // vacuidade — sem a rota montada, e sem gate nenhum.
      expect(res.body.message).toContain('não tem cartão neste simulado');
    });

    it('sem cursinhoId recusa com 400', async () => {
      await request(app.getHttpServer())
        .get(
          `/v1/relatorio-simulado/${SIM_HTTP.toString()}/estudante/u-http-falha`,
        )
        .expect(400);
    });
  });
});
