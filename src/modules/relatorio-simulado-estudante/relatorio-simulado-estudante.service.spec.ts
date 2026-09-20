import { Logger, NotFoundException } from '@nestjs/common';
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

  it('⚠️ dois nulos EMPATAM (0): a ordem entre eles é estável', async () => {
    // O `.sort()` do teste acima joga fora justamente o que este braço do
    // comparador decide: qual das sem número vem primeiro.
    //
    // ⚠️ **`return 1` aqui é mutante EQUIVALENTE, medido.** O TimSort do V8
    // só olha `ordem < 0` (tanto na inserção binária quanto no merge), então
    // `0` e `1` são indistinguíveis em runtime e nenhum teste de caixa-preta
    // pode matar essa mutação. O `0` continua sendo o certo porque `1` nos
    // dois sentidos não é uma ordem total — é correção de contrato, não de
    // comportamento observável.
    //
    // O que este teste MATA é `return -1`, que inverte a ordem das sem
    // número (verificado), e qualquer mudança que as faça sumir ou sair do
    // fim da lista.
    const { svc } = montarQ(
      [
        agregado({ questaoId: 'q-sem-a' }),
        agregado({ questaoId: 'q-sem-b' }),
        agregado({ questaoId: 'q-sem-c' }),
        agregado({ questaoId: 'q1' }),
      ],
      [
        { questaoId: 'q-sem-a', numero: null },
        { questaoId: 'q-sem-b', numero: null },
        { questaoId: 'q-sem-c', numero: null },
        { questaoId: 'q1', numero: 3 },
      ],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    // as três sem número sobrevivem, no fim, NA ORDEM EM QUE ENTRARAM
    expect(r.questoes.map((q) => q.questaoId)).toEqual([
      'q1',
      'q-sem-a',
      'q-sem-b',
      'q-sem-c',
    ]);
    expect(r.questoes.map((q) => q.numero)).toEqual([3, null, null, null]);
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

describe('RelatorioSimuladoEstudanteService.consultarDetalhe', () => {
  const montarDetalhe = (over?: { linha?: any; numeros?: any[] }) => {
    const repository = {
      buscarDetalheDoEstudante: jest
        .fn()
        .mockResolvedValue(over?.linha ?? null),
    };
    const simuladoRepository = {
      getNumerosDasQuestoes: jest.fn().mockResolvedValue(over?.numeros ?? []),
    };
    const svc = new RelatorioSimuladoEstudanteService(
      repository as any,
      simuladoRepository as any,
    );
    return { svc, repository, simuladoRepository };
  };

  const comRespostas = (respostas: any[], over: any = {}) => ({
    usuario: 'u1',
    historico: { status: 'completed', respostas, ...over },
  });

  it('classifica acerto, erro e sem leitura', async () => {
    const { svc } = montarDetalhe({
      linha: comRespostas([
        { questao: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A' },
        { questao: 'q2', alternativaEstudante: 'B', alternativaCorreta: 'C' },
        { questao: 'q3', alternativaCorreta: 'D' },
      ]),
      numeros: [
        { questaoId: 'q1', numero: 1 },
        { questaoId: 'q2', numero: 2 },
        { questaoId: 'q3', numero: 3 },
      ],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas.map((x) => x.resultado)).toEqual([
      'acerto',
      'erro',
      'sem_leitura',
    ]);
  });

  it('repassa o recorte ao repositório — simulado, cursinho e usuário', async () => {
    const { svc, repository, simuladoRepository } = montarDetalhe({
      linha: comRespostas([]),
    });

    await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(repository.buscarDetalheDoEstudante).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });
    expect(simuladoRepository.getNumerosDasQuestoes).toHaveBeenCalledWith(SIM);
  });

  it('⚠️ sem leitura é a AUSÊNCIA da chave, não uma alternativa vazia', async () => {
    // se alguém trocar por `=== null` ou `=== ''`, a questão não marcada passa
    // a contar como erro e o professor revisa a aula errada
    const { svc } = montarDetalhe({
      linha: comRespostas([{ questao: 'q1', alternativaCorreta: 'D' }]),
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas[0].resultado).toBe('sem_leitura');
    expect(r.respostas[0].alternativaEstudante).toBeUndefined();
  });

  it('junta o número vindo do simulado', async () => {
    const { svc } = montarDetalhe({
      linha: comRespostas([
        { questao: 'q7', alternativaEstudante: 'A', alternativaCorreta: 'A' },
      ]),
      numeros: [{ questaoId: 'q7', numero: 7 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas[0].numero).toBe(7);
    expect(r.respostas[0].questaoId).toBe('q7');
  });

  it('questão sem número vai para o FIM, não some', async () => {
    const { svc } = montarDetalhe({
      linha: comRespostas([
        {
          questao: 'q-sem',
          alternativaEstudante: 'A',
          alternativaCorreta: 'A',
        },
        { questao: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A' },
      ]),
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas.map((x) => x.numero)).toEqual([1, null]);
    expect(r.respostas.map((x) => x.questaoId)).toEqual(['q1', 'q-sem']);
  });

  it('⚠️ duas questões sem número EMPATAM (0): a ordem entre elas é estável', async () => {
    // Mesmo braço não testado do `consultarQuestoes` — ver o comentário
    // longo lá: `return 1` é mutante equivalente no V8, `return -1` é morto
    // por este teste.
    const { svc } = montarDetalhe({
      linha: comRespostas([
        {
          questao: 'q-sem-a',
          alternativaEstudante: 'A',
          alternativaCorreta: 'A',
        },
        {
          questao: 'q-sem-b',
          alternativaEstudante: 'B',
          alternativaCorreta: 'C',
        },
        {
          questao: 'q-sem-c',
          alternativaCorreta: 'D',
        },
        { questao: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A' },
      ]),
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    // as três sem número sobrevivem, no fim, NA ORDEM EM QUE ENTRARAM
    expect(r.respostas.map((x) => x.questaoId)).toEqual([
      'q1',
      'q-sem-a',
      'q-sem-b',
      'q-sem-c',
    ]);
    expect(r.respostas.map((x) => x.numero)).toEqual([1, null, null, null]);
  });

  it('linha inexistente vira NotFoundException, não lista vazia', async () => {
    // a tela pediu UM estudante; devolver vazio diria "ele não respondeu nada",
    // que é outra coisa
    const { svc } = montarDetalhe({ linha: null });

    await expect(
      svc.consultarDetalhe({
        simuladoId: SIM,
        cursinhoId: 'cur-1',
        usuario: 'u1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('histórico falho devolve a falha DESCRITA e nenhuma resposta', async () => {
    // as respostas do fixture são as da tentativa ANTERIOR (que completou):
    // com `respostas: []` o `toHaveLength(0)` passaria para qualquer
    // implementação, e o teste não diria nada.
    const { svc } = montarDetalhe({
      linha: {
        usuario: 'u1',
        historico: {
          status: 'failed',
          respostas: [
            {
              questao: 'q1',
              alternativaEstudante: 'A',
              alternativaCorreta: 'A',
            },
          ],
          falha: { codigo: 'cartao_nao_detectado' },
        },
      },
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.status).toBe('failed');
    expect(r.falha).toEqual(
      expect.objectContaining({
        codigo: 'cartao_nao_detectado',
        descricao: expect.stringContaining(
          'Não foi possível localizar o cartão',
        ),
        acaoSugerida: 'reenviar_foto',
      }),
    );
    expect(r.respostas).toHaveLength(0);
  });

  it('⚠️ completed que ainda carrega falha antiga NÃO devolve a falha', async () => {
    // `marcarFalha` é o único escritor de `falha` e nada nunca a desfaz — o
    // `completeProcessing` não toca nela. Sem este gate a tela diria "lido" e
    // mostraria o motivo do erro ao lado.
    const { svc } = montarDetalhe({
      linha: comRespostas([], {
        status: 'completed',
        falha: { codigo: 'cartao_nao_detectado' },
      }),
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.falha).toBeUndefined();
  });

  it('linha órfã (histórico apagado) vira NotFoundException', async () => {
    const { svc } = montarDetalhe({
      linha: { usuario: 'u1', historico: null },
    });

    await expect(
      svc.consultarDetalhe({
        simuladoId: SIM,
        cursinhoId: 'cur-1',
        usuario: 'u1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('histórico sem a chave respostas devolve lista vazia, não estoura', async () => {
    // `awaiting_omr` nunca teve `respostas` — o documento não tem a chave
    const { svc } = montarDetalhe({
      linha: { usuario: 'u1', historico: { status: 'awaiting_omr' } },
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.status).toBe('awaiting_omr');
    expect(r.respostas).toEqual([]);
  });

  it('⚠️ cartão que falhou NÃO devolve as respostas da tentativa anterior', async () => {
    // `completeProcessing` é o único escritor de `respostas`; `marcarFalha` e
    // `prepararParaProcessamento` não as limpam. Um cartão que completou,
    // reprocessou e falhou carrega as respostas velhas — devolvê-las diz que
    // a leitura atual produziu o que ela não produziu.
    const { svc } = montarDetalhe({
      linha: comRespostas(
        [{ questao: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A' }],
        { status: 'failed', falha: { codigo: 'cartao_nao_detectado' } },
      ),
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas).toHaveLength(0);
  });

  it.each([['pending'], ['processing'], ['awaiting_omr']])(
    '⚠️ status %s também não devolve respostas',
    async (status) => {
      const { svc } = montarDetalhe({
        linha: comRespostas(
          [
            {
              questao: 'q1',
              alternativaEstudante: 'A',
              alternativaCorreta: 'A',
            },
          ],
          { status },
        ),
        numeros: [{ questaoId: 'q1', numero: 1 }],
      });

      const r = await svc.consultarDetalhe({
        simuladoId: SIM,
        cursinhoId: 'cur-1',
        usuario: 'u1',
      });

      expect(r.respostas).toHaveLength(0);
    },
  );
});
