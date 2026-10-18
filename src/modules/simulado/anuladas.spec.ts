import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { HistoricoService } from '../historico/historico.service';
import { AvisoDeResultadoService } from './aviso-de-resultado.service';
import {
  calcularAproveitamento,
  montarRespostasAproveitamento,
} from './calcularAproveitamento';
import { numerosAnuladosDoContainer } from './anuladas';
import { recalcularAproveitamento } from './recalcularAproveitamento';
import { SimuladoService } from './simulado.service';

/**
 * tickets/042, card 02 — a anulada fica FORA da análise (D2): sai do numerador
 * e do denominador. 50 de 89, nunca "51 de 90".
 */
const id = (s: string) => ({ toString: () => s });
const mat = (n: string) => ({ _id: id(`m-${n}`), nome: n });
const fr = (n: string, m: string) => ({
  _id: id(`f-${n}`),
  nome: n,
  materia: mat(m),
});

function questao(i: number, opts: { frentes?: ReturnType<typeof fr>[] } = {}) {
  const frentes = opts.frentes ?? [fr('Álgebra', 'Matemática')];
  const q: any = {
    _id: id(`q${i}`),
    alternativa: 'A',
    materia: frentes[0].materia,
  };
  frentes.forEach((f, k) => (q[`frente${k + 1}`] = f));
  return q;
}

/** 90 questões; acerta `acertos` delas (pulando a 45), e na 45 marca `na45`. */
function prova90(acertos: number, na45: 'A' | 'B') {
  const questoes = Array.from({ length: 90 }, (_, i) => questao(i + 1));
  const raw: any[] = [];
  let feitos = 0;
  for (let n = 1; n <= 90; n++) {
    if (n === 45) raw.push({ questao: 'q45', alternativaEstudante: na45 });
    else
      raw.push({
        questao: `q${n}`,
        alternativaEstudante: feitos++ < acertos ? 'A' : 'B',
      });
  }
  const container = questoes.map((q, i) => ({
    questao: q,
    numero: i + 1,
    ...(i + 1 === 45 ? { anulacao: { motivo: 'outro' } } : {}),
  }));
  return { questoes, raw, container };
}

const anuladasDe = (container: { questao: any; numero: number }[]) => {
  const numeros = new Map(
    container.map((c) => [c.questao._id.toString(), c.numero]),
  );
  return {
    numeros: numerosAnuladosDoContainer(container),
    numeroDe: (qid: string) => numeros.get(qid),
  };
};

describe('nota sem as anuladas (042/02) — calcularAproveitamento', () => {
  it('errou a anulada e acertou 50 → 50/89', () => {
    const { questoes, raw, container } = prova90(50, 'B');
    const ap = calcularAproveitamento(
      montarRespostasAproveitamento(questoes, raw, anuladasDe(container)),
    );
    expect(ap.geral).toBeCloseTo(50 / 89, 10);
  });

  it('⚠️ acertou a anulada e mais 49 → 49/89 (não é ponto para todos)', () => {
    const { questoes, raw, container } = prova90(49, 'A');
    const ap = calcularAproveitamento(
      montarRespostasAproveitamento(questoes, raw, anuladasDe(container)),
    );
    expect(ap.geral).toBeCloseTo(49 / 89, 10);
    expect(ap.materias[0].questoes).toBe(89);
  });

  it('interdisciplinar anulada sai de TODAS as matérias e frentes que toca; quem só tinha ela some', () => {
    const inter = questao(1, {
      frentes: [fr('Brasil', 'História'), fr('Trabalho', 'Sociologia')],
    });
    const outra = questao(2, { frentes: [fr('Brasil', 'História')] });
    const container = [
      { questao: inter, numero: 1, anulacao: {} },
      { questao: outra, numero: 2 },
    ];
    const ap = calcularAproveitamento(
      montarRespostasAproveitamento(
        [inter, outra],
        [
          { questao: 'q1', alternativaEstudante: 'A' },
          { questao: 'q2', alternativaEstudante: 'A' },
        ],
        anuladasDe(container),
      ),
    );
    expect(ap.materias.map((m) => [m.nome, m.questoes])).toEqual([
      ['História', 1],
    ]);
    expect(ap.materias[0].frentes).toEqual([
      expect.objectContaining({ nome: 'Brasil', questoes: 1 }),
    ]);
    expect(ap.geral).toBe(1);
  });

  it('sem anuladas: resultado idêntico ao de hoje', () => {
    const { questoes, raw } = prova90(50, 'B');
    const semNada = calcularAproveitamento(
      montarRespostasAproveitamento(questoes, raw),
    );
    const container = questoes.map((q, i) => ({ questao: q, numero: i + 1 }));
    const comVazio = calcularAproveitamento(
      montarRespostasAproveitamento(questoes, raw, anuladasDe(container)),
    );
    expect(comVazio).toEqual(semNada);
  });

  it('⚠️ por NÚMERO: sucessora no slot 45 + histórico com a original → a 45 fica fora', () => {
    const { questoes, container } = prova90(0, 'A');
    // Nova versão: o slot 45 aponta para "q45v2"; o histórico gravou "q45".
    const sucessora = { ...questoes[44], _id: id('q45v2') };
    const atuais = questoes.map((q, i) => (i === 44 ? sucessora : q));
    const containerAtual = container.map((c, i) =>
      i === 44 ? { ...c, questao: sucessora } : c,
    );
    const gravadas = questoes.map((q, i) => ({
      questao: q._id.toString(),
      numero: i + 1,
      alternativaEstudante: 'A',
      alternativaCorreta: 'A',
    }));
    const { novo } = recalcularAproveitamento(
      null,
      atuais,
      gravadas,
      anuladasDe(containerAtual),
    );
    expect(novo.materias[0].questoes).toBe(89);
  });
});

describe('nota sem as anuladas (042/02) — processAnswer', () => {
  function montar(acertos: number, na45: 'A' | 'B', revisaoAnulacao?: number) {
    const { raw, container } = prova90(acertos, na45);
    const historicoRepository: any = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest
        .fn()
        .mockResolvedValue({ simulado: 's1', rawRespostas: raw }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
      marcarFalha: jest.fn(),
    };
    const questoesRepository: any = {
      findAnoByQuestao: jest.fn().mockResolvedValue(2026),
      updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SimuladoService(
      {
        answer: jest.fn().mockResolvedValue({
          _id: 's1',
          questoes: container,
          revisaoAnulacao,
        }),
      } as any,
      questoesRepository,
      {} as any,
      historicoRepository,
      {} as any,
      {} as any,
    );
    return { service, historicoRepository, questoesRepository };
  }

  it('grava acertos, respondidas e total sem a anulada, os números e a revisão', async () => {
    const { service, historicoRepository } = montar(50, 'B', 3);
    await service.processAnswer('h1');
    const p = historicoRepository.completeProcessing.mock.calls[0][1];
    expect(p).toMatchObject({
      acertos: 50,
      questoesRespondidas: 89,
      totalConsiderado: 89,
      numerosAnulados: [45],
      revisaoAnulacao: 3,
    });
    expect(p.aproveitamento.geral).toBeCloseTo(50 / 89, 10);
    expect(p.respostas.find((r: any) => r.numero === 45).anulada).toBe(true);
    expect(p.respostas.filter((r: any) => r.anulada)).toHaveLength(1);
  });

  it('acertou a anulada → não conta como acerto', async () => {
    const { service, historicoRepository } = montar(49, 'A');
    await service.processAnswer('h1');
    const p = historicoRepository.completeProcessing.mock.calls[0][1];
    expect(p.acertos).toBe(49);
    expect(p.revisaoAnulacao).toBe(0);
  });

  it('D9: a estatística global da questão recebe TODAS as respostas', async () => {
    const { service, questoesRepository } = montar(50, 'B');
    await service.processAnswer('h1');
    expect(
      questoesRepository.updateQuestionAnswered.mock.calls[0][0],
    ).toHaveLength(90);
  });
});

describe('totais sem as anuladas fora do ms (042/02)', () => {
  it('push do resultado do cartão (028) diz "de 89"', async () => {
    const repo = {
      getById: jest.fn().mockResolvedValue({
        usuario: 'a',
        cartaoCode: 'C',
        status: HistoricoStatus.Completed,
        acertos: 50,
        questoesRespondidas: 89,
        totalConsiderado: 89,
        simulado: { nome: 'S', questoes: new Array(90).fill({}) },
      }),
    };
    const service = new AvisoDeResultadoService(
      repo as never,
      {
        get: (k: string) =>
          ({ API_URL: 'http://x', NOTIFICACAO_SECRET: 's' })[k],
      } as never,
    );
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    (global as any).fetch = fetchMock;
    await service.avisar('h1');
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo).toMatchObject({
      total: 89,
      acertos: 50,
      emBranco: 0,
      aproveitamento: 56,
    });
  });

  it('dashboard do aluno: totalQuestionsTest sem as anuladas (e o de sempre em histórico antigo)', async () => {
    const base = {
      simulado: { nome: 'S', questoes: new Array(90).fill({}) },
      aproveitamento: { geral: 0.5, materias: [] as never[] },
      questoesRespondidas: 89,
    };
    const repo = {
      getToPerformance: jest.fn().mockResolvedValue([
        { ...base, _id: 'novo', totalConsiderado: 89, numerosAnulados: [45] },
        { ...base, _id: 'antigo' },
      ]),
    };
    const service = new HistoricoService(repo as never);
    const r = await service.getPerformance('u');
    expect(r.historicos.map((h) => h.totalQuestionsTest)).toEqual([89, 90]);
    expect(r.historicos[0].numerosAnulados).toEqual([45]);
  });
});

describe('toanswer com anulada (042/10)', () => {
  it('a anulada vai marcada e SEM imageId; as outras, como sempre', async () => {
    const simulado = {
      _id: 's1',
      nome: 'S',
      bloqueado: false,
      categoria: { _id: 'c1', duracao: 60 },
      questoes: [
        { questao: { _id: 'q1', imageId: 'img1' }, numero: 1 },
        {
          questao: { _id: 'q2', imageId: 'img2' },
          numero: 2,
          anulacao: { motivo: 'outro' },
        },
      ],
    };
    const service = new SimuladoService(
      {
        getAvailabilityById: jest.fn().mockResolvedValue({
          bloqueado: false,
          disponivelDe: null,
          disponivelAte: null,
        }),
        getById: jest.fn().mockResolvedValue(simulado),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const r = await service.getToAnswer('s1');
    expect(r!.questoes.map((q) => [q.anulada, q.imageId])).toEqual([
      [false, 'img1'],
      [true, undefined],
    ]);
  });
});
