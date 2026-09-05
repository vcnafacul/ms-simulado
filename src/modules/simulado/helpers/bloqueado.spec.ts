import { Status } from '../../questao/enums/status.enum';
import {
  atingiuQuantidade,
  calcularBloqueado,
  revalidarBloqueado,
  todasNumeradas,
} from './bloqueado';

/** Simulado liberável: 2 questões, aprovadas e numeradas. */
function simuladoOk(overrides: any = {}) {
  return {
    categoria: { quantidadeTotalQuestao: 2 },
    questoes: [
      { questao: { _id: 'q1', status: Status.Approved }, numero: 1 },
      { questao: { _id: 'q2', status: Status.Approved }, numero: 2 },
    ],
    bloqueado: true,
    ...overrides,
  } as any;
}

describe('calcularBloqueado', () => {
  it('libera quando atinge a quantidade, todas aprovadas e todas numeradas', () => {
    expect(calcularBloqueado(simuladoOk())).toBe(false);
  });

  it('bloqueia quando não atingiu a quantidade da categoria', () => {
    const sml = simuladoOk({ categoria: { quantidadeTotalQuestao: 3 } });
    expect(calcularBloqueado(sml)).toBe(true);
  });

  it('bloqueia quando alguma questão não está aprovada', () => {
    const sml = simuladoOk();
    sml.questoes[1].questao.status = Status.Pending;
    expect(calcularBloqueado(sml)).toBe(true);
  });

  it('bloqueia quando alguma questão está sem número', () => {
    const sml = simuladoOk();
    sml.questoes[1].numero = null;
    expect(calcularBloqueado(sml)).toBe(true);
  });

  it('categoria livre (quantidadeTotalQuestao null) ignora a contagem', () => {
    const sml = simuladoOk({ categoria: { quantidadeTotalQuestao: null } });
    expect(calcularBloqueado(sml)).toBe(false);
  });

  it('override trata a questão em trânsito como aprovada (fluxo approvedQuestion)', () => {
    const sml = simuladoOk();
    sml.questoes[1].questao.status = Status.Pending;

    expect(calcularBloqueado(sml, { questaoId: 'q2', aprovada: true })).toBe(
      false,
    );
  });

  it('override trata a questão em trânsito como reprovada (fluxo refuseQuestion)', () => {
    expect(
      calcularBloqueado(simuladoOk(), { questaoId: 'q2', aprovada: false }),
    ).toBe(true);
  });

  it('override não muda o veredito das outras questões', () => {
    const sml = simuladoOk();
    sml.questoes[0].questao.status = Status.Pending;

    expect(calcularBloqueado(sml, { questaoId: 'q2', aprovada: true })).toBe(
      true,
    );
  });

  it('override não escapa da regra de numeração', () => {
    const sml = simuladoOk();
    sml.questoes[1].numero = null;

    expect(calcularBloqueado(sml, { questaoId: 'q2', aprovada: true })).toBe(
      true,
    );
  });
});

describe('revalidarBloqueado', () => {
  it('escreve o resultado no documento e o devolve', () => {
    const sml = simuladoOk();

    expect(revalidarBloqueado(sml)).toBe(false);
    expect(sml.bloqueado).toBe(false);
  });

  it('re-bloqueia um simulado liberado que deixou de satisfazer a regra', () => {
    const sml = simuladoOk({ bloqueado: false });
    sml.questoes[1].numero = null;

    expect(revalidarBloqueado(sml)).toBe(true);
    expect(sml.bloqueado).toBe(true);
  });

  it('ordena as questões por numero ao liberar', () => {
    const sml = simuladoOk();
    sml.questoes[0].numero = 10;
    sml.questoes[1].numero = 2;

    revalidarBloqueado(sml);

    expect(sml.questoes.map((qc: any) => qc.numero)).toEqual([2, 10]);
  });

  it('não reordena quando o simulado continua bloqueado', () => {
    const sml = simuladoOk();
    sml.questoes[0].numero = 10;
    sml.questoes[1].questao.status = Status.Pending;

    revalidarBloqueado(sml);

    expect(sml.bloqueado).toBe(true);
    expect(sml.questoes.map((qc: any) => qc.questao._id)).toEqual(['q1', 'q2']);
  });
});

describe('atingiuQuantidade', () => {
  it('retorna true quando a categoria é livre (null)', () => {
    expect(atingiuQuantidade(null, 0)).toBe(true);
    expect(atingiuQuantidade(null, 42)).toBe(true);
  });

  it('retorna true quando o total bate com o alvo numérico', () => {
    expect(atingiuQuantidade(30, 30)).toBe(true);
  });

  it('retorna false quando o total não bate com o alvo numérico', () => {
    expect(atingiuQuantidade(30, 29)).toBe(false);
    expect(atingiuQuantidade(30, 31)).toBe(false);
  });
});

describe('todasNumeradas', () => {
  it('retorna true quando todas as entries tem numero', () => {
    expect(todasNumeradas([{ numero: 1 }, { numero: 2 }, { numero: 3 }])).toBe(
      true,
    );
  });

  it('retorna false quando alguma entry tem numero null', () => {
    expect(todasNumeradas([{ numero: 1 }, { numero: null }])).toBe(false);
  });

  it('retorna false quando alguma entry tem numero undefined', () => {
    expect(todasNumeradas([{ numero: 1 }, { numero: undefined as any }])).toBe(
      false,
    );
  });

  it('trata numero 0 como numero valido (nao confundir com falsy)', () => {
    expect(todasNumeradas([{ numero: 0 }])).toBe(true);
  });

  it('retorna true pra lista vazia (nada a numerar)', () => {
    expect(todasNumeradas([])).toBe(true);
  });
});
