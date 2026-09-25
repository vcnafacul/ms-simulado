import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { Status } from '../questao/enums/status.enum';

function makeService(simuladoRepo: Record<string, jest.Mock>) {
  const service = new SimuladoService(
    simuladoRepo as any, // simuladoRepository
    {} as any, // questoesRepository
    {} as any, // categoriaRepository
    {} as any, // historicoRepository
    {} as any, // materiaRepository
    {} as any, // queueProducer
  );
  return service;
}

const DE = new Date('2026-01-10T00:00:00.000Z');
const ATE = new Date('2026-01-20T00:00:00.000Z');

describe('SimuladoService.getToAnswer (gate de disponibilidade)', () => {
  it('retorna null quando o simulado não existe', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue(null),
    });
    await expect(service.getToAnswer('x')).resolves.toBeNull();
  });

  it('lança 403 com status "bloqueado" quando bloqueado', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({ bloqueado: true }),
    });
    await expect(service.getToAnswer('x')).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await service.getToAnswer('x');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((e as HttpException).getResponse()).toMatchObject({
        status: 'bloqueado',
      });
    }
  });

  it('lança 403 com status "antes_da_janela" quando antes da janela', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: new Date(Date.now() + 60 * 60 * 1000),
        disponivelAte: null,
      }),
    });
    try {
      await service.getToAnswer('x');
      fail('deveria ter lançado');
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({
        status: 'antes_da_janela',
      });
    }
  });

  it('lança 403 com status "depois_da_janela" quando depois da janela', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: null,
        disponivelAte: new Date(Date.now() - 60 * 60 * 1000),
      }),
    });
    try {
      await service.getToAnswer('x');
      fail('deveria ter lançado');
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({
        status: 'depois_da_janela',
      });
    }
  });

  it('retorna o simulado montado quando disponível (null/null)', async () => {
    const simulado = {
      _id: 's1',
      nome: 'S',
      descricao: 'd',
      bloqueado: false,
      disponivelDe: null,
      disponivelAte: null,
      categoria: { _id: 'c1', duracao: 60 },
      questoes: [],
    } as any;
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: null,
        disponivelAte: null,
      }),
      getById: jest.fn().mockResolvedValue(simulado),
    });
    const result = await service.getToAnswer('s1');
    expect(result).toMatchObject({ _id: 's1', nome: 'S', duracao: 60 });
  });

  it('monta questoes a partir de questoes (numero do subdoc)', async () => {
    const simulado = {
      _id: 's1',
      nome: 'S',
      descricao: 'd',
      bloqueado: false,
      disponivelDe: null,
      disponivelAte: null,
      categoria: { _id: 'c1', duracao: 60 },
      questoes: [
        {
          questao: {
            _id: 'q1',
            enemArea: 'Mat',
            frente1: { _id: 'f1' },
            frente2: null,
            frente3: null,
            materia: { _id: 'm1' },
            imageId: 'img1',
            prova: 'p1',
          },
          numero: 7,
        },
      ],
    } as any;
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: null,
        disponivelAte: null,
      }),
      getById: jest.fn().mockResolvedValue(simulado),
    });

    const result = await service.getToAnswer('s1');

    expect(result!.questoes).toEqual([
      {
        _id: 'q1',
        enemArea: 'Mat',
        frente1: { _id: 'f1' },
        frente2: null,
        frente3: null,
        materia: { _id: 'm1' },
        numero: 7,
        imageId: 'img1',
      },
    ]);
  });
});

describe('SimuladoService.updateDisponibilidade', () => {
  it('lança NotFound quando o simulado não existe', async () => {
    const service = makeService({
      getById: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.updateDisponibilidade('x', { disponivelDe: DE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lança 400 quando disponivelDe >= disponivelAte (ambos no dto)', async () => {
    const service = makeService({
      getById: jest.fn().mockResolvedValue({ _id: 'x' }),
      updateDisponibilidade: jest.fn(),
    });
    await expect(
      service.updateDisponibilidade('x', {
        disponivelDe: ATE,
        disponivelAte: DE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança 400 ao patchar só disponivelDe se o disponivelAte existente ficar invertido', async () => {
    const service = makeService({
      getById: jest.fn().mockResolvedValue({ _id: 'x', disponivelAte: DE }),
      updateDisponibilidade: jest.fn(),
    });
    await expect(
      service.updateDisponibilidade('x', { disponivelDe: ATE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persiste só o campo enviado (omitido = inalterado)', async () => {
    const updateDisponibilidade = jest.fn().mockResolvedValue(undefined);
    const getById = jest
      .fn()
      .mockResolvedValue({ _id: 'x', disponivelDe: null, disponivelAte: null });
    const service = makeService({ getById, updateDisponibilidade });

    await service.updateDisponibilidade('x', { disponivelAte: ATE });

    expect(updateDisponibilidade).toHaveBeenCalledWith('x', {
      disponivelAte: ATE,
    });
  });

  it('propaga null explícito para limpar', async () => {
    const updateDisponibilidade = jest.fn().mockResolvedValue(undefined);
    const getById = jest
      .fn()
      .mockResolvedValue({ _id: 'x', disponivelDe: DE, disponivelAte: ATE });
    const service = makeService({ getById, updateDisponibilidade });

    await service.updateDisponibilidade('x', { disponivelDe: null });

    expect(updateDisponibilidade).toHaveBeenCalledWith('x', {
      disponivelDe: null,
    });
  });
});

describe('SimuladoService.addQuestionSimulados (single-write questoes)', () => {
  it('empurra em questoes e desbloqueia quando atinge quantidade e todas aprovadas', async () => {
    const updateSession = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ updateSession });
    const sml: any = {
      _id: 's1',
      questoes: [],
      categoria: { quantidadeTotalQuestao: 1 },
      bloqueado: true,
    };
    const question: any = {
      _id: 'q1',
      numero: 1,
      status: Status.Approved,
    };

    await service.addQuestionSimulados([sml], question, 1);

    expect(sml.questoes).toHaveLength(1);
    expect(sml.bloqueado).toBe(false);
    expect(updateSession).toHaveBeenCalledWith(sml, undefined);
  });

  it('mantém bloqueado quando ainda não atingiu a quantidade', async () => {
    const service = makeService({
      updateSession: jest.fn().mockResolvedValue(undefined),
    });
    const sml: any = {
      _id: 's1',
      questoes: [],
      categoria: { quantidadeTotalQuestao: 30 },
      bloqueado: true,
    };

    await service.addQuestionSimulados(
      [sml],
      {
        _id: 'q1',
        numero: 1,
        status: Status.Approved,
      } as any,
      1,
    );

    expect(sml.bloqueado).toBe(true);
  });

  it('mantém bloqueado quando a questão sendo adicionada não tem número', async () => {
    const service = makeService({
      updateSession: jest.fn().mockResolvedValue(undefined),
    });
    const sml: any = {
      _id: 's1',
      questoes: [],
      categoria: { quantidadeTotalQuestao: 1 },
      bloqueado: true,
    };

    await service.addQuestionSimulados(
      [sml],
      { _id: 'q1', numero: null, status: Status.Approved } as any,
      null as any,
    );

    expect(sml.bloqueado).toBe(true);
  });
});

describe('SimuladoService.removeQuestionSimulados (single-write questoes)', () => {
  it('remove de questoes e bloqueia o simulado', async () => {
    const updateSession = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ updateSession });
    const sml: any = {
      _id: 's1',
      questoes: [{ questao: { _id: 'q1' }, numero: 1 }],
      bloqueado: false,
    };

    await service.removeQuestionSimulados([sml], { _id: 'q1' } as any);

    expect(sml.questoes).toHaveLength(0);
    expect(sml.bloqueado).toBe(true);
    expect(updateSession).toHaveBeenCalledWith(sml, undefined);
  });

  it('não mexe quando a questão não estava no simulado', async () => {
    const updateSession = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ updateSession });
    const sml: any = {
      _id: 's1',
      questoes: [{ questao: { _id: 'outra' }, numero: 1 }],
      bloqueado: false,
    };

    await service.removeQuestionSimulados([sml], { _id: 'q1' } as any);

    expect(sml.questoes).toHaveLength(1);
    expect(sml.bloqueado).toBe(false);
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe('SimuladoService.processAnswer (lê questoes)', () => {
  it('mapeia respostas a partir de questoes e completa o histórico', async () => {
    const questao: any = {
      _id: { toString: () => 'q1' },
      alternativa: 'A',
      materia: { _id: { toString: () => 'm1' }, nome: 'Mat' },
      frente1: { _id: { toString: () => 'f1' }, nome: 'Fr' },
    };
    const simulado: any = {
      _id: 's1',
      questoes: [{ questao, numero: 1 }],
    };

    const historicoRepository: any = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest.fn().mockResolvedValue({
        simulado: 's1',
        rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
      }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository: any = {
      answer: jest.fn().mockResolvedValue(simulado),
    };
    const questoesRepository: any = {
      findAnoByQuestao: jest.fn().mockResolvedValue(2023),
      updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SimuladoService(
      simuladoRepository,
      questoesRepository,
      {} as any, // categoriaRepository
      historicoRepository,
      {} as any, // materiaRepository
      {} as any, // queueProducer
    );

    await service.processAnswer('hist1');

    // buscou o ano pela primeira questão de questoes (reverse-lookup)
    expect(questoesRepository.findAnoByQuestao).toHaveBeenCalledWith(
      questao._id,
    );
    // completou com 1 resposta mapeada de questoes
    const payload = historicoRepository.completeProcessing.mock.calls[0][1];
    expect(payload.ano).toBe(2023);
    expect(payload.respostas).toHaveLength(1);
    expect(payload.respostas[0].alternativaEstudante).toBe('A');
    expect(payload.respostas[0].alternativaCorreta).toBe('A');
  });

  it('marca Failed sem crashar quando o simulado não tem questões', async () => {
    const historicoRepository: any = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest.fn().mockResolvedValue({
        simulado: 's1',
        rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
      }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository: any = {
      answer: jest.fn().mockResolvedValue({ _id: 's1', questoes: [] }),
    };
    const questoesRepository: any = {
      findAnoByQuestao: jest.fn(),
      updateQuestionAnswered: jest.fn(),
    };

    const service = new SimuladoService(
      simuladoRepository,
      questoesRepository,
      {} as any,
      historicoRepository,
      {} as any,
      {} as any,
    );

    await expect(service.processAnswer('hist1')).resolves.toBeUndefined();

    expect(questoesRepository.findAnoByQuestao).not.toHaveBeenCalled();
    expect(historicoRepository.completeProcessing).not.toHaveBeenCalled();
    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'hist1',
      'simulado_sem_questoes',
      expect.any(String),
    );
  });
});

describe('SimuladoService.processAnswer — motivo da falha (card 01)', () => {
  const montar = (over: any = {}) => {
    const historicoRepository = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest.fn().mockResolvedValue({
        rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
        simulado: { _id: 's1' },
      }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
      ...over.historicoRepository,
    };
    const simuladoRepository = {
      answer: jest.fn().mockResolvedValue({
        questoes: [
          {
            numero: 1,
            questao: {
              _id: 'q1',
              alternativa: 'A',
              materia: { _id: 'm1', nome: 'Mat' },
              frente1: { _id: 'f1', nome: 'Fr' },
            },
          },
        ],
      }),
      ...over.simuladoRepository,
    };
    const questoesRepository = {
      findAnoByQuestao: jest.fn().mockResolvedValue(2025),
      updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
      ...over.questoesRepository,
    };
    const service = new SimuladoService(
      simuladoRepository as any, // simuladoRepository
      questoesRepository as any, // questoesRepository
      {} as any, // categoriaRepository
      historicoRepository as any, // historicoRepository
      {} as any, // materiaRepository
      {} as any, // queueProducer
    );
    return { service, historicoRepository, simuladoRepository };
  };

  it('sem rawRespostas grava respostas_ausentes', async () => {
    const { service, historicoRepository } = montar({
      historicoRepository: {
        getById: jest.fn().mockResolvedValue({ simulado: { _id: 's1' } }),
      },
    });

    await service.processAnswer('h1');

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'respostas_ausentes',
      expect.any(String),
    );
  });

  it('erro inesperado grava erro_no_processamento com a mensagem no detalhe', async () => {
    const { service, historicoRepository } = montar({
      simuladoRepository: {
        answer: jest.fn().mockRejectedValue(new Error('mongo caiu')),
      },
    });

    await expect(service.processAnswer('h1')).rejects.toThrow('mongo caiu');

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'erro_no_processamento',
      'mongo caiu',
    );
  });

  it('caminho feliz não grava falha nenhuma', async () => {
    const { service, historicoRepository } = montar();

    await service.processAnswer('h1');

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
    expect(historicoRepository.completeProcessing).toHaveBeenCalled();
  });
});

describe('SimuladoService.processAnswer — questoesRespondidas (card 01)', () => {
  /**
   * O card 01: o fluxo do cartão (`createAwaitingOmr` →
   * `prepararParaProcessamento` → `completeProcessing`) nunca gravava
   * `questoesRespondidas`. O campo deixou de ser gate dos agregados, mas
   * continua sendo o que responde "leu 87 de 90" na tela.
   *
   * ⚠️ Gravar no `completeProcessing` dá **um** escritor para o campo, no ponto
   * em que a resposta é normalizada. É o que impede o próximo fluxo de entrada
   * (importação, API pública) de nascer com o mesmo buraco.
   */
  function questao(id: string, alternativa = 'A') {
    return {
      _id: { toString: () => id },
      alternativa,
      materia: { _id: { toString: () => 'm1' }, nome: 'Mat' },
      frente1: { _id: { toString: () => 'f1' }, nome: 'Fr' },
    } as any;
  }

  function montar(opts: { questoes: any[]; rawRespostas: any[] }) {
    const historicoRepository: any = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest.fn().mockResolvedValue({
        simulado: 's1',
        rawRespostas: opts.rawRespostas,
      }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SimuladoService(
      {
        answer: jest.fn().mockResolvedValue({
          _id: 's1',
          questoes: opts.questoes.map((q, i) => ({
            questao: q,
            numero: i + 1,
          })),
        }),
      } as any,
      {
        findAnoByQuestao: jest.fn().mockResolvedValue(2026),
        updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      historicoRepository,
      {} as any,
      {} as any,
    );
    return { service, historicoRepository };
  }

  async function respondidas(opts: { questoes: any[]; rawRespostas: any[] }) {
    const { service, historicoRepository } = montar(opts);
    await service.processAnswer('hist1');
    return historicoRepository.completeProcessing.mock.calls[0][1]
      .questoesRespondidas;
  }

  it('⚠️ cartão com 3 questões não lidas de 5 grava 2', async () => {
    const questoes = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => questao(id));

    expect(
      await respondidas({
        questoes,
        rawRespostas: [
          { questao: 'q1', alternativaEstudante: 'A' },
          { questao: 'q2', alternativaEstudante: 'C' },
        ],
      }),
    ).toBe(2);
  });

  it('⚠️ resposta de questão que NÃO está no simulado não conta', async () => {
    // Deriva de `respostasAproveitamento`, e não de `rawRespostas.length`. O
    // que chega do ms-omr pode trazer questão de outra prova (template errado,
    // foto do cartão trocada); o `map` sobre `simulado.questoes` é o gate, e a
    // contagem tem de sair de DEPOIS dele.
    expect(
      await respondidas({
        questoes: [questao('q1')],
        rawRespostas: [
          { questao: 'q1', alternativaEstudante: 'A' },
          { questao: 'q-de-outra-prova', alternativaEstudante: 'B' },
        ],
      }),
    ).toBe(1);
  });

  it('cartão totalmente ilegível grava 0, e não fica ausente', async () => {
    expect(
      await respondidas({
        questoes: [questao('q1'), questao('q2')],
        rawRespostas: [],
      }),
    ).toBe(0);
  });

  it('digital completo: o número é o total de questões do simulado', async () => {
    const questoes = ['q1', 'q2', 'q3'].map((id) => questao(id));

    expect(
      await respondidas({
        questoes,
        rawRespostas: questoes.map((_, i) => ({
          questao: `q${i + 1}`,
          alternativaEstudante: 'A',
        })),
      }),
    ).toBe(3);
  });

  it('⚠️ alternativa em branco explícita não conta como lida', async () => {
    // O ms-omr manda a questão com `alternativaEstudante` ausente quando a
    // marcação foi descartada (branco ou dupla marcação). O `?.` do map já
    // produz `undefined` nos dois casos; este teste trava a distinção.
    expect(
      await respondidas({
        questoes: [questao('q1'), questao('q2')],
        rawRespostas: [
          { questao: 'q1', alternativaEstudante: 'A' },
          { questao: 'q2' },
        ],
      }),
    ).toBe(1);
  });
});

describe('SimuladoService.processAnswer — acertos absolutos (card 08)', () => {
  /**
   * O card 08: cursinho conversa em ACERTOS ("fiz 61 na primeira aplicação",
   * "o corte de Medicina ficou em 78"), não em percentual — e o percentual
   * sozinho esconde o denominador: 58% de 45 e 58% de 180 são confianças
   * completamente diferentes sobre o mesmo número.
   *
   * ⚠️ Contado aqui, e **nunca derivado** de `aproveitamento.geral × total`:
   * a fração já arredondada produz 44 onde o aluno fez 45 — e ele confere esse
   * número à mão, contra o próprio cartão.
   */
  function questao(id: string, alternativa = 'A') {
    return {
      _id: { toString: () => id },
      alternativa,
      materia: { _id: { toString: () => 'm1' }, nome: 'Mat' },
      frente1: { _id: { toString: () => 'f1' }, nome: 'Fr' },
    } as any;
  }

  function montar(opts: { questoes: any[]; rawRespostas: any[] }) {
    const historicoRepository: any = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest.fn().mockResolvedValue({
        simulado: 's1',
        rawRespostas: opts.rawRespostas,
      }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SimuladoService(
      {
        answer: jest.fn().mockResolvedValue({
          _id: 's1',
          questoes: opts.questoes.map((q, i) => ({
            questao: q,
            numero: i + 1,
          })),
        }),
      } as any,
      {
        findAnoByQuestao: jest.fn().mockResolvedValue(2026),
        updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      historicoRepository,
      {} as any,
      {} as any,
    );
    return { service, historicoRepository };
  }

  async function acertosDe(opts: { questoes: any[]; rawRespostas: any[] }) {
    const { service, historicoRepository } = montar(opts);
    await service.processAnswer('hist1');
    return historicoRepository.completeProcessing.mock.calls[0][1].acertos;
  }

  it('conta os acertos, comparando com o gabarito da questão', async () => {
    expect(
      await acertosDe({
        questoes: [questao('q1', 'A'), questao('q2', 'B'), questao('q3', 'C')],
        rawRespostas: [
          { questao: 'q1', alternativaEstudante: 'A' },
          { questao: 'q2', alternativaEstudante: 'B' },
          { questao: 'q3', alternativaEstudante: 'E' },
        ],
      }),
    ).toBe(2);
  });

  it('⚠️ questão NÃO LIDA não conta como acerto nem como erro', async () => {
    // A chave `alternativaEstudante` vem ausente quando o ms-omr descartou a
    // marcação (branco ou dupla).
    expect(
      await acertosDe({
        questoes: [questao('q1', 'A'), questao('q2', 'B')],
        rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
      }),
    ).toBe(1);
  });

  it('⚠️ questão SEM GABARITO não vira acerto de quem não respondeu', async () => {
    /*
      O caso que a guarda `!== undefined` existe para impedir, e ele é REAL:
      `Questao.alternativa` é `@Prop({ select: false })` no schema. Se uma
      consulta deixar de trazê-lo, `alternativaCorreta` chega `undefined` em
      TODAS as respostas — e `undefined === undefined` é `true`.

      Sem a guarda, um simulado inteiro sem gabarito daria 100% de acerto para
      quem não marcou nada. Escrevi este teste depois que a mutação que remove
      a guarda sobreviveu a todos os outros: nenhum deles tinha gabarito
      ausente, porque o caso parece impossível até olhar o `select: false`.
    */
    const semGabarito = {
      _id: { toString: () => 'q1' },
      alternativa: undefined,
      materia: { _id: { toString: () => 'm1' }, nome: 'Mat' },
      frente1: { _id: { toString: () => 'f1' }, nome: 'Fr' },
    } as any;

    expect(
      await acertosDe({
        questoes: [semGabarito, semGabarito],
        rawRespostas: [],
      }),
    ).toBe(0);
  });

  it('cartão totalmente ilegível grava 0 acertos, e não ausente', async () => {
    expect(
      await acertosDe({
        questoes: [questao('q1'), questao('q2')],
        rawRespostas: [],
      }),
    ).toBe(0);
  });

  it('⚠️ resposta de questão fora do simulado não conta', async () => {
    // Mesma razão do `questoesRespondidas`: o `map` sobre `simulado.questoes` é
    // o gate, e a contagem sai de depois dele.
    expect(
      await acertosDe({
        questoes: [questao('q1', 'A')],
        rawRespostas: [
          { questao: 'q1', alternativaEstudante: 'A' },
          { questao: 'q-de-outra-prova', alternativaEstudante: 'A' },
        ],
      }),
    ).toBe(1);
  });

  it('⚠️ acertos ≤ questoesRespondidas ≤ total, sempre', async () => {
    // A invariante que pega um filtro trocado: acertar mais questões do que se
    // respondeu é impossível, e sairia como nota acima de 100% na tela.
    const { service, historicoRepository } = montar({
      questoes: [questao('q1', 'A'), questao('q2', 'B'), questao('q3', 'C')],
      rawRespostas: [
        { questao: 'q1', alternativaEstudante: 'A' },
        { questao: 'q2', alternativaEstudante: 'E' },
      ],
    });
    await service.processAnswer('hist1');
    const p = historicoRepository.completeProcessing.mock.calls[0][1];

    expect(p.acertos).toBeLessThanOrEqual(p.questoesRespondidas);
    expect(p.questoesRespondidas).toBeLessThanOrEqual(p.respostas.length);
  });
});

describe('SimuladoService.criaAproveitamento — frentes secundárias (card 14)', () => {
  /**
   * O card 14: só `frente1` entrava na conta, e **1.413 das 2.640 questões** de
   * homol têm uma frente secundária. O drill-down por frente subcontava mais da
   * metade da base, sem nada acusar — o radar desenha o que tem, não o que
   * faltou.
   *
   * ⚠️ Decisão de produto: **peso inteiro em cada frente e em cada matéria**.
   * A questão interdisciplinar conta 1 para as duas, e cada percentual passa a
   * ser "% de acerto nas questões que TOCAM isto".
   */
  const materia = (id: string, nome: string) => ({ _id: id, nome }) as any;
  const frente = (id: string, nome: string, mat: any) =>
    ({ _id: id, nome, materia: mat }) as any;

  const HIST = materia('m-hist', 'História');
  const SOC = materia('m-soc', 'Sociologia');

  function resposta(over: any = {}) {
    const q = {
      _id: over.id ?? 'q1',
      materia: over.materia ?? HIST,
      frente1: over.frente1 ?? frente('f-rep', 'República', HIST),
      frente2: over.frente2,
      frente3: over.frente3,
    };
    return {
      questao: q,
      alternativaEstudante: over.acertou === false ? 'B' : 'A',
      alternativaCorreta: 'A',
      materia: q.materia,
      frente: q.frente1,
    } as any;
  }

  /** Chama o método privado — é onde a regra vive. */
  const calcular = (respostas: any[]) => {
    const svc = new SimuladoService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return (svc as any).criaAproveitamento(respostas);
  };

  it('⚠️ questão interdisciplinar conta INTEIRA nas duas matérias', async () => {
    const a = await calcular([
      resposta({ frente2: frente('f-cid', 'Cidadania', SOC) }),
    ]);

    expect(a.materias.map((m: any) => m.nome).sort()).toEqual([
      'História',
      'Sociologia',
    ]);
    expect(a.materias.every((m: any) => m.aproveitamento === 1)).toBe(true);
  });

  it('⚠️ a frente secundária mora sob a matéria DELA', async () => {
    // Pô-la sob História faria o drill-down mostrar "História › Cidadania",
    // que é falso.
    const a = await calcular([
      resposta({ frente2: frente('f-cid', 'Cidadania', SOC) }),
    ]);

    const soc = a.materias.find((m: any) => m.nome === 'Sociologia');
    expect(soc.frentes.map((f: any) => f.nome)).toEqual(['Cidadania']);
    const hist = a.materias.find((m: any) => m.nome === 'História');
    expect(hist.frentes.map((f: any) => f.nome)).toEqual(['República']);
  });

  it('⚠️ o denominador de cada frente são as questões que a TOCAM', async () => {
    // 3 questões: duas só de República (1 acerto), uma que toca República e
    // Cidadania (acerto). República = 2/3; Cidadania = 1/1.
    const a = await calcular([
      resposta({ id: 'q1' }),
      resposta({ id: 'q2', acertou: false }),
      resposta({ id: 'q3', frente2: frente('f-cid', 'Cidadania', SOC) }),
    ]);

    const rep = a.materias
      .find((m: any) => m.nome === 'História')
      .frentes.find((f: any) => f.nome === 'República');
    expect(rep.aproveitamento).toBeCloseTo(2 / 3, 10);

    const cid = a.materias
      .find((m: any) => m.nome === 'Sociologia')
      .frentes.find((f: any) => f.nome === 'Cidadania');
    expect(cid.aproveitamento).toBe(1);
  });

  it('⚠️ `geral` continua sobre as RESPOSTAS, não sobre os vínculos', async () => {
    // Duas questões, uma interdisciplinar: 3 vínculos, 2 respostas. Se `geral`
    // contasse vínculos, o aluno passaria de 100%.
    const a = await calcular([
      resposta({ id: 'q1' }),
      resposta({ id: 'q2', frente2: frente('f-cid', 'Cidadania', SOC) }),
    ]);

    expect(a.geral).toBe(1);
  });

  it('⚠️ as bases das matérias NÃO somam o total do simulado', async () => {
    // É a consequência aceita do peso inteiro, e a razão de a base ter de
    // aparecer junto do percentual nas telas: 2 questões, 3 vínculos.
    const a = await calcular([
      resposta({ id: 'q1' }),
      resposta({ id: 'q2', frente2: frente('f-cid', 'Cidadania', SOC) }),
    ]);

    expect(a.materias).toHaveLength(2);
    // História tocada por 2 questões, Sociologia por 1 — total 3 > 2 respostas
    const hist = a.materias.find((m: any) => m.nome === 'História');
    const soc = a.materias.find((m: any) => m.nome === 'Sociologia');
    expect(hist.frentes[0].aproveitamento).toBe(1);
    expect(soc.frentes[0].aproveitamento).toBe(1);
  });

  it('⚠️ `frente2: ""` não cria matéria nem frente fantasma', async () => {
    // 125 questões de homol guardam string vazia no lugar do id.
    const a = await calcular([resposta({ frente2: '' })]);

    expect(a.materias).toHaveLength(1);
    expect(a.materias[0].frentes).toHaveLength(1);
  });

  it('questão errada não soma acerto em nenhum dos vínculos', async () => {
    const a = await calcular([
      resposta({ acertou: false, frente2: frente('f-cid', 'Cidadania', SOC) }),
    ]);

    expect(a.geral).toBe(0);
    expect(a.materias.every((m: any) => m.aproveitamento === 0)).toBe(true);
  });

  it('⚠️ questão NÃO LIDA não conta como acerto', async () => {
    const r = resposta();
    r.alternativaEstudante = undefined;
    const a = await calcular([r]);

    expect(a.geral).toBe(0);
    // mas a questão segue no denominador da frente — ela foi cobrada
    expect(a.materias[0].frentes[0].aproveitamento).toBe(0);
  });

  it('lista vazia não estoura nem divide por zero', async () => {
    const a = await calcular([]);

    expect(a.geral).toBe(0);
    expect(a.materias).toEqual([]);
  });

  describe('⚠️ o que o cálculo ANTIGO derrubava', () => {
    it('questão com `frente1: null` não estoura o processamento', async () => {
      /*
        São **2 questões reais** em homol. O código antigo fazia
        `res.frente._id.toString()` — `TypeError` com frente nula, que caía no
        catch do `processAnswer` e marcava o cartão inteiro como
        `erro_no_processamento`. Um cartão perdido por causa de uma questão.

        Agora ela simplesmente não entra no drill-down; o `geral` conta.
      */
      const semFrente = resposta({ id: 'q-ruim' });
      semFrente.questao.frente1 = null;

      const a = await calcular([semFrente, resposta({ id: 'q-boa' })]);

      expect(a.geral).toBe(1);
      // só a questão boa aparece no drill-down
      expect(a.materias).toHaveLength(1);
      expect(a.materias[0].frentes).toHaveLength(1);
    });

    it('⚠️ um simulado SÓ com questões sem frente não estoura', async () => {
      const semFrente = resposta({ id: 'q1' });
      semFrente.questao.frente1 = null;

      const a = await calcular([semFrente]);

      expect(a.geral).toBe(1);
      expect(a.materias).toEqual([]);
    });

    it.each([null, undefined, ''])(
      'frente2 = %p convive com frente1 boa, sem erro',
      async (valor) => {
        const a = await calcular([resposta({ frente2: valor })]);

        expect(a.materias).toHaveLength(1);
        expect(a.materias[0].frentes).toHaveLength(1);
      },
    );
  });
});

describe('SimuladoService.processAnswer — contadores globais (card 21)', () => {
  const questao: any = {
    _id: { toString: () => 'q1' },
    alternativa: 'A',
    materia: { _id: { toString: () => 'm1' }, nome: 'Mat' },
    frente1: {
      _id: { toString: () => 'f1' },
      nome: 'Fr',
      materia: { _id: { toString: () => 'm1' }, nome: 'Mat' },
    },
  };

  const montar = (respostasAnteriores?: unknown[]) => {
    const updateQuestionAnswered = jest.fn().mockResolvedValue(undefined);
    const service = new SimuladoService(
      {
        answer: jest
          .fn()
          .mockResolvedValue({ _id: 's1', questoes: [{ questao, numero: 1 }] }),
      } as any,
      {
        findAnoByQuestao: jest.fn().mockResolvedValue(2023),
        updateQuestionAnswered,
      } as any,
      {} as any,
      {
        claimForProcessing: jest.fn().mockResolvedValue(true),
        getById: jest.fn().mockResolvedValue({
          simulado: 's1',
          rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
          respostas: respostasAnteriores,
        }),
        completeProcessing: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
    );
    return { service, updateQuestionAnswered };
  };

  it('⚠️ passa as respostas ANTERIORES para serem descontadas', async () => {
    /*
      `processAnswer` roda mais de uma vez no mesmo histórico: o reenvio de foto
      e o callback do OMR passam por `prepararParaProcessamento`, que devolve o
      status a `Pending` e republica na fila.

      ⚠️ E `prepararParaProcessamento` NÃO limpa `respostas` — é por isso que a
      contagem antiga ainda está no documento para ser desfeita.
    */
    const anteriores = [
      { questao: 'q1', alternativaEstudante: 'B', alternativaCorreta: 'A' },
    ];
    const { service, updateQuestionAnswered } = montar(anteriores);

    await service.processAnswer('hist1');

    expect(updateQuestionAnswered.mock.calls[0][1]).toBe(anteriores);
  });

  it('primeira passada manda lista vazia, e não `undefined`', async () => {
    // Histórico novo não tem `respostas`. O repositório trata `[]`; deixar
    // `undefined` chegar lá seria confiar no default de outro arquivo.
    const { service, updateQuestionAnswered } = montar(undefined);

    await service.processAnswer('hist1');

    expect(updateQuestionAnswered.mock.calls[0][1]).toEqual([]);
  });
});

describe('SimuladoService.criaAproveitamento — base por matéria e frente (card 30)', () => {
  /**
   * Monta uma questão com até três frentes, cada uma podendo ter matéria
   * própria — é o caso que o card 14 mediu: 928 das 1.616 frentes secundárias
   * são de matéria diferente da questão.
   */
  const questaoCom = (
    id: string,
    frentes: { f: string; m: string }[],
    materia = 'm1',
  ): any => {
    const q: any = {
      _id: { toString: () => id },
      alternativa: 'A',
      materia: { _id: { toString: () => materia }, nome: materia },
    };
    frentes.forEach((v, i) => {
      q[`frente${i + 1}`] = {
        _id: { toString: () => v.f },
        nome: v.f,
        materia: { _id: { toString: () => v.m }, nome: v.m },
      };
    });
    return q;
  };

  const processar = async (questoes: any[], marcadas: string[]) => {
    const completeProcessing = jest.fn().mockResolvedValue(undefined);
    const service = new SimuladoService(
      {
        answer: jest.fn().mockResolvedValue({
          _id: 's1',
          questoes: questoes.map((questao, i) => ({ questao, numero: i + 1 })),
        }),
      } as any,
      {
        findAnoByQuestao: jest.fn().mockResolvedValue(2023),
        updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {
        claimForProcessing: jest.fn().mockResolvedValue(true),
        getById: jest.fn().mockResolvedValue({
          simulado: 's1',
          rawRespostas: marcadas.map((q) => ({
            questao: q,
            alternativaEstudante: 'A',
          })),
        }),
        completeProcessing,
      } as any,
      {} as any,
      {} as any,
    );
    await service.processAnswer('h1');
    return completeProcessing.mock.calls[0][1].aproveitamento;
  };

  it('grava quantas questões tocam cada matéria e cada frente', async () => {
    const ap = await processar(
      [
        questaoCom('q1', [{ f: 'Álgebra', m: 'Matemática' }], 'Matemática'),
        questaoCom('q2', [{ f: 'Álgebra', m: 'Matemática' }], 'Matemática'),
        questaoCom('q3', [{ f: 'Geometria', m: 'Matemática' }], 'Matemática'),
      ],
      ['q1'],
    );

    const mat = ap.materias.find((m: any) => m.nome === 'Matemática');
    expect(mat.questoes).toBe(3);
    expect(mat.frentes.find((f: any) => f.nome === 'Álgebra').questoes).toBe(2);
    expect(mat.frentes.find((f: any) => f.nome === 'Geometria').questoes).toBe(
      1,
    );
  });

  it('⚠️ as bases somam MAIS que o total do simulado, e é isso que a base explica', async () => {
    /*
      É a consequência do card 14: uma questão conta inteira em cada (matéria,
      frente) que toca. Duas questões, uma delas interdisciplinar, produzem três
      vínculos — e sem a base na tela, quem soma as matérias acha que a conta
      não fecha.
    */
    const ap = await processar(
      [
        questaoCom('q1', [{ f: 'Brasil', m: 'História' }], 'História'),
        questaoCom(
          'q2',
          [
            { f: 'Brasil', m: 'História' },
            { f: 'Trabalho', m: 'Sociologia' },
          ],
          'História',
        ),
      ],
      ['q1'],
    );

    const soma = ap.materias.reduce((t: number, m: any) => t + m.questoes, 0);
    expect(soma).toBe(3);
    expect(ap.materias).toHaveLength(2);
  });

  it('a base é de QUESTÕES, não de acertos — conta quem não marcou também', async () => {
    const ap = await processar(
      [
        questaoCom('q1', [{ f: 'Álgebra', m: 'Matemática' }], 'Matemática'),
        questaoCom('q2', [{ f: 'Álgebra', m: 'Matemática' }], 'Matemática'),
      ],
      [], // ninguém marcou nada
    );

    const mat = ap.materias[0];
    expect(mat.questoes).toBe(2);
    expect(mat.aproveitamento).toBe(0);
  });

  it('⚠️ QA: 2 questões de Matemática, uma com 3 frentes — Matemática tem 2, não 4', async () => {
    const ap = await processar(
      [
        questaoCom('q1', [{ f: 'Álgebra', m: 'Matemática' }], 'Matemática'),
        questaoCom(
          'q2',
          [
            { f: 'Financeira', m: 'Matemática' },
            { f: 'Álgebra', m: 'Matemática' },
            { f: 'Estatística', m: 'Matemática' },
          ],
          'Matemática',
        ),
      ],
      [],
    );

    const mat = ap.materias.find((m: any) => m.nome === 'Matemática');
    expect(mat.questoes).toBe(2);
    // As frentes continuam com peso inteiro — e somam mais que a matéria.
    const porFrente = Object.fromEntries(
      mat.frentes.map((f: any) => [f.nome, f.questoes]),
    );
    expect(porFrente).toEqual({ Álgebra: 2, Financeira: 1, Estatística: 1 });
  });

  it('⚠️ acertar a questão de 3 frentes vale UM acerto na matéria, não três', async () => {
    const ap = await processar(
      [
        questaoCom('q1', [{ f: 'Álgebra', m: 'Matemática' }], 'Matemática'),
        questaoCom(
          'q2',
          [
            { f: 'Financeira', m: 'Matemática' },
            { f: 'Álgebra', m: 'Matemática' },
            { f: 'Estatística', m: 'Matemática' },
          ],
          'Matemática',
        ),
      ],
      ['q2'], // acertou só a de 3 frentes
    );

    const mat = ap.materias.find((m: any) => m.nome === 'Matemática');
    // Antes: 3/4 = 75%. Certo: 1 de 2.
    expect(mat.aproveitamento).toBe(0.5);
  });
});
