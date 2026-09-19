import { Logger } from '@nestjs/common';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

const SIM = '665f0c1a2b3c4d5e6f00abc2';

const linha = (over: any = {}) => ({
  usuario: 'u1',
  turmaId: 't-1',
  ...over,
  // depois de `...over`: senão um `over.historico` parcial (como nos testes
  // de falha/awaiting_omr) apagaria os defaults acima, incluindo o `_id`.
  historico: {
    _id: 'h1',
    status: 'completed',
    cartaoCode: '7',
    questoesRespondidas: 90,
    aproveitamento: { geral: 0.72 },
    ...over.historico,
  },
});

const montar = (linhas: any[], total = 30) => {
  const repository = {
    buscarPorRecorte: jest.fn().mockResolvedValue(linhas),
    contarDoCursinho: jest.fn().mockResolvedValue(total),
  };
  return {
    svc: new RelatorioSimuladoEstudanteService(repository as any, {} as any),
    repository,
  };
};

describe('RelatorioSimuladoEstudanteService.consultar', () => {
  it('monta a linha do estudante com o que as telas usam', async () => {
    const { svc } = montar([linha()]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas[0]).toEqual({
      usuario: 'u1',
      turmaId: 't-1',
      historicoId: 'h1',
      status: 'completed',
      cartaoCode: '7',
      questoesRespondidas: 90,
      aproveitamentoGeral: 0.72,
      falha: undefined,
    });
    expect(r.totalEstudantesComCartaoNoCursinho).toBe(30);
  });

  it('traduz a falha — a tela recebe a frase, não o código', async () => {
    const { svc } = montar([
      linha({
        historico: {
          status: 'failed',
          falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
        },
      }),
    ]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas[0].falha).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'sem CSV',
      descricao: expect.stringContaining('Não foi possível localizar o cartão'),
      acaoSugerida: 'reenviar_foto',
    });
  });

  it('cartão que ainda não foi lido vem SEM aproveitamento, não com zero', async () => {
    // zero é uma nota; ausência de leitura não é. Iguais, a média do card 04 mente.
    const { svc } = montar([
      linha({
        historico: {
          status: 'awaiting_omr',
          questoesRespondidas: undefined,
          aproveitamento: undefined,
        },
      }),
    ]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas[0].aproveitamentoGeral).toBeUndefined();
    expect(r.linhas[0].status).toBe('awaiting_omr');
  });

  it('repassa o recorte ao repositório, incluindo a turma', async () => {
    const { svc, repository } = montar([]);

    await svc.consultar({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });

    expect(repository.buscarPorRecorte).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });
    // a contagem é do CURSINHO, não da turma — é o denominador do rodapé
    expect(repository.contarDoCursinho).toHaveBeenCalledWith(SIM, 'cur-1');
  });

  it('recorte sem cartão nenhum devolve lista vazia, não erro', async () => {
    const { svc } = montar([], 0);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas).toEqual([]);
    expect(r.totalEstudantesComCartaoNoCursinho).toBe(0);
  });

  it('linha com histórico apagado não derruba o relatório inteiro', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { svc } = montar([
      { usuario: 'u-orfao', turmaId: 't-1', historico: null },
      linha(),
    ]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    // a linha órfã some, as outras sobrevivem — e fica rastro para investigar
    expect(r.linhas.map((l) => l.usuario)).toEqual(['u1']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('u-orfao'));
    error.mockRestore();
  });
});

describe('RelatorioSimuladoEstudanteService.consultarQuestoes', () => {
  const agregado = (over: any = {}) => ({
    questaoId: 'q1',
    respondentes: 10,
    acertos: 6,
    erros: 3,
    semLeitura: 1,
    porAlternativa: { A: 6, B: 2, C: 1, D: 0, E: 0 },
    ...over,
  });

  const montarQ = (agregados: any[], numeros: any[]) => {
    const repository = {
      agregarPorQuestao: jest.fn().mockResolvedValue(agregados),
    };
    const simuladoRepository = {
      getNumerosDasQuestoes: jest.fn().mockResolvedValue(numeros),
    };
    return {
      svc: new RelatorioSimuladoEstudanteService(
        repository as any,
        simuladoRepository as any,
      ),
      repository,
      simuladoRepository,
    };
  };

  it('põe o número da questão, que não está na resposta', async () => {
    const { svc } = montarQ([agregado()], [{ questaoId: 'q1', numero: 5 }]);

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes[0]).toEqual({
      numero: 5,
      questaoId: 'q1',
      respondentes: 10,
      acertos: 6,
      erros: 3,
      semLeitura: 1,
      porAlternativa: { A: 6, B: 2, C: 1, D: 0, E: 0 },
    });
  });

  it('ordena por número — é como o professor lê', async () => {
    const { svc } = montarQ(
      [agregado({ questaoId: 'q9' }), agregado({ questaoId: 'q1' })],
      [
        { questaoId: 'q9', numero: 9 },
        { questaoId: 'q1', numero: 1 },
      ],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes.map((q) => q.numero)).toEqual([1, 9]);
  });

  it('questão sem número vai para o fim, não some nem quebra', async () => {
    const { svc } = montarQ(
      [agregado({ questaoId: 'q-sem' }), agregado({ questaoId: 'q1' })],
      [
        { questaoId: 'q-sem', numero: null },
        { questaoId: 'q1', numero: 3 },
      ],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes.map((q) => q.numero)).toEqual([3, null]);
  });

  it('duas questões sem número empatam, e as duas aparecem', async () => {
    const { svc } = montarQ(
      [
        agregado({ questaoId: 'q-sem-a' }),
        agregado({ questaoId: 'q1' }),
        agregado({ questaoId: 'q-sem-b' }),
      ],
      [
        { questaoId: 'q-sem-a', numero: null },
        { questaoId: 'q1', numero: 3 },
        { questaoId: 'q-sem-b', numero: null },
      ],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes.map((q) => q.numero)).toEqual([3, null, null]);
    expect(r.questoes.map((q) => q.questaoId).sort()).toEqual([
      'q-sem-a',
      'q-sem-b',
      'q1',
    ]);
  });

  it('repassa o recorte, incluindo a turma', async () => {
    const { svc, repository, simuladoRepository } = montarQ([], []);

    await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });

    expect(repository.agregarPorQuestao).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });
    expect(simuladoRepository.getNumerosDasQuestoes).toHaveBeenCalledWith(SIM);
  });

  it('recorte sem cartão nenhum devolve lista vazia, não erro', async () => {
    const { svc } = montarQ([], [{ questaoId: 'q1', numero: 1 }]);

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes).toEqual([]);
  });
});
