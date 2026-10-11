import { syncNumeroNaProvaESimulados } from '../prova/helpers/question-container.helpers';
import { SimuladoService } from './simulado.service';

/**
 * ⚠️ Dentro de uma transação, o Mongo recusa duas operações ao mesmo tempo na
 * mesma sessão ("Given transaction number N+1 … does not match any in-progress
 * transactions"). As escritas nos simulados da prova têm de ser em SEQUÊNCIA —
 * achado ao cadastrar questão na prova ENEM Dia 1 do cursinho (2 simulados).
 */
function contadorDeConcorrencia() {
  let emVoo = 0;
  let maximo = 0;
  const escrever = jest.fn(async () => {
    emVoo++;
    maximo = Math.max(maximo, emVoo);
    await new Promise((r) => setTimeout(r, 5));
    emVoo--;
  });
  return { escrever, maximo: () => maximo };
}

const simulado = (id: string, questoes: unknown[] = []) =>
  ({
    _id: id,
    questoes,
    bloqueado: true,
    categoria: { quantidadeTotalQuestao: 90 },
  }) as never;

describe('escritas em sequência dentro da transação', () => {
  const sessao = {} as never;

  it('addQuestionSimulados: um simulado de cada vez', async () => {
    const c = contadorDeConcorrencia();
    // Só o repositório é usado; o resto dos dependentes não é tocado.
    const service = Object.assign(Object.create(SimuladoService.prototype), {
      simuladoRepository: { updateSession: c.escrever },
    }) as SimuladoService;
    await service.addQuestionSimulados(
      [simulado('a'), simulado('b'), simulado('c')],
      { _id: 'q1', status: 1 } as never,
      1,
      sessao,
    );
    expect(c.escrever).toHaveBeenCalledTimes(3);
    expect(c.maximo()).toBe(1);
  });

  it('removeQuestionSimulados: um simulado de cada vez', async () => {
    const c = contadorDeConcorrencia();
    // Só o repositório é usado; o resto dos dependentes não é tocado.
    const service = Object.assign(Object.create(SimuladoService.prototype), {
      simuladoRepository: { updateSession: c.escrever },
    }) as SimuladoService;
    const qc = () => [{ questao: { _id: 'q1' }, numero: 1 }];
    await service.removeQuestionSimulados(
      [simulado('a', qc()), simulado('b', qc())],
      { _id: 'q1' } as never,
      sessao,
    );
    expect(c.escrever).toHaveBeenCalledTimes(2);
    expect(c.maximo()).toBe(1);
  });

  it('syncNumeroNaProvaESimulados: um simulado de cada vez', async () => {
    const c = contadorDeConcorrencia();
    const qc = () => [{ questao: { _id: 'q1' }, numero: 1 }];
    await syncNumeroNaProvaESimulados(
      {
        getById: async () => ({
          questoes: qc(),
          simulados: [simulado('a', qc()), simulado('b', qc())],
        }),
        update: jest.fn(),
      } as never,
      { update: c.escrever } as never,
      'p1',
      'q1',
      7,
      sessao,
    );
    expect(c.escrever).toHaveBeenCalledTimes(2);
    expect(c.maximo()).toBe(1);
  });
});
