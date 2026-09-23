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

/**
 * ⚠️ `totalDeQuestoes` (card 08) sai do SIMULADO, então o `simuladoRepository`
 * deixou de ser um `{}` aqui: o `consultar` chama `getNumerosDasQuestoes`.
 * O padrão são 3 questões, para o total ser distinguível de qualquer contagem
 * de linhas do teste.
 */
const montar = (linhas: any[], total = 30, questoes = 3) => {
  const repository = {
    buscarPorRecorte: jest.fn().mockResolvedValue(linhas),
    contarDoCursinho: jest.fn().mockResolvedValue(total),
  };
  const simuladoRepository = {
    getNumerosDasQuestoes: jest.fn().mockResolvedValue(
      Array.from({ length: questoes }, (_, i) => ({
        questaoId: `q${i}`,
        numero: i + 1,
      })),
    ),
    // ⚠️ Card 18: o `consultar` passou a buscar o nome do simulado.
    getNomesPorIds: jest
      .fn()
      .mockResolvedValue([{ id: SIM, nome: 'Simulado' }]),
  };

  /*
    ⚠️ Entrou no card 16: `consultarQuestoes` passou a buscar os
    contadores GLOBAIS da questão — outro ESCOPO, não outro cálculo.
    Mapa vazio por padrão: o service trata a ausência como zero, e é o
    que os testes que não falam de dificuldade global exercitam.
  */
  const questaoRepository = {
    contadoresGlobais: jest.fn().mockResolvedValue(new Map()),
  };
  return {
    svc: new RelatorioSimuladoEstudanteService(
      repository as any,
      simuladoRepository as any,
      questaoRepository as any,
    ),
    repository,
    simuladoRepository,
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

    /*
      ⚠️ Entrou no card 16: `consultarQuestoes` passou a buscar os
      contadores GLOBAIS da questão — outro ESCOPO, não outro cálculo.
      Mapa vazio por padrão: o service trata a ausência como zero, e é o
      que os testes que não falam de dificuldade global exercitam.
    */
    const questaoRepository = {
      contadoresGlobais: jest.fn().mockResolvedValue(new Map()),
    };
    return {
      svc: new RelatorioSimuladoEstudanteService(
        repository as any,
        simuladoRepository as any,
        questaoRepository as any,
      ),
      repository,
      simuladoRepository,
      questaoRepository,
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
      alternativaCorreta: undefined,
      discriminacao: undefined,
      /*
        ⚠️ Zero, e não ausente (card 16): questão que não está na coleção — ou
        que ninguém respondeu — sai com contador zerado. A tela é quem decide
        não exibir, pelo piso de base; um `null` obrigaria todo o caminho até a
        coluna a carregar mais um estado.
      */
      acertosGeral: 0,
      baseGeral: 0,
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

  describe('dificuldade global (card 16)', () => {
    it('⚠️ traz o acerto da BASE INTEIRA junto do acerto do recorte', async () => {
      /*
        É outro ESCOPO, não outro cálculo. O recorte não tem como responder
        "minha turma foi mal nesta questão, ou a questão é difícil para todo
        mundo?" — e é essa a pergunta que muda a decisão de "preciso dar essa
        aula" para "a questão é dura mesmo".
      */
      const { svc, questaoRepository } = montarQ(
        [agregado()],
        [{ questaoId: 'q1', numero: 5 }],
      );
      questaoRepository.contadoresGlobais.mockResolvedValue(
        new Map([['q1', { acertos: 443, quantidadeResposta: 1847 }]]),
      );

      const r = await svc.consultarQuestoes({
        simuladoId: SIM,
        cursinhoId: 'cur-1',
      });

      expect(r.questoes[0].acertosGeral).toBe(443);
      expect(r.questoes[0].baseGeral).toBe(1847);
      // e o do recorte continua intacto ao lado
      expect(r.questoes[0].acertos).toBe(6);
      expect(r.questoes[0].respondentes).toBe(10);
    });

    it('⚠️ busca só as questões do AGREGADO, não as do simulado inteiro', async () => {
      // As que ninguém respondeu não viram linha nenhuma na tabela — buscá-las
      // seria carga por nada.
      const { svc, questaoRepository } = montarQ(
        [agregado({ questaoId: 'q1' }), agregado({ questaoId: 'q2' })],
        [
          { questaoId: 'q1', numero: 1 },
          { questaoId: 'q2', numero: 2 },
          { questaoId: 'q3', numero: 3 },
        ],
      );

      await svc.consultarQuestoes({ simuladoId: SIM, cursinhoId: 'cur-1' });

      expect(questaoRepository.contadoresGlobais).toHaveBeenCalledWith([
        'q1',
        'q2',
      ]);
    });

    it('questão sem contador sai com zero, e não quebra a linha', async () => {
      const { svc } = montarQ([agregado()], [{ questaoId: 'q1', numero: 5 }]);

      const r = await svc.consultarQuestoes({
        simuladoId: SIM,
        cursinhoId: 'cur-1',
      });

      expect(r.questoes[0].acertosGeral).toBe(0);
      expect(r.questoes[0].baseGeral).toBe(0);
    });
  });
});

describe('RelatorioSimuladoEstudanteService.listarSimulados', () => {
  const montarLista = (over?: {
    agregado?: any[];
    nomes?: { id: string; nome: string }[];
  }) => {
    const repository = {
      listarSimuladosComCartao: jest
        .fn()
        .mockResolvedValue(over?.agregado ?? []),
    };
    const simuladoRepository = {
      getNomesPorIds: jest.fn().mockResolvedValue(over?.nomes ?? []),
    };

    /*
      ⚠️ Entrou no card 16: `consultarQuestoes` passou a buscar os
      contadores GLOBAIS da questão — outro ESCOPO, não outro cálculo.
      Mapa vazio por padrão: o service trata a ausência como zero, e é o
      que os testes que não falam de dificuldade global exercitam.
    */
    const questaoRepository = {
      contadoresGlobais: jest.fn().mockResolvedValue(new Map()),
    };
    const svc = new RelatorioSimuladoEstudanteService(
      repository as any,
      simuladoRepository as any,
      questaoRepository as any,
    );
    return { svc, repository, simuladoRepository };
  };

  it('junta o nome ao agregado, pelo id', async () => {
    const { svc } = montarLista({
      agregado: [
        {
          simuladoId: 's1',
          cartoes: 3,
          comLeituraConcluida: 2,
          ultimoEnvio: new Date('2026-05-02'),
        },
      ],
      nomes: [{ id: 's1', nome: 'ENEM 2024 — 1º dia' }],
    });

    const r = await svc.listarSimulados({ cursinhoId: 'cur-1' });

    expect(r.simulados[0]).toEqual({
      simuladoId: 's1',
      nome: 'ENEM 2024 — 1º dia',
      cartoes: 3,
      comLeituraConcluida: 2,
      ultimoEnvio: new Date('2026-05-02'),
    });
  });

  it('simulado apagado depois do vínculo vira nome nulo, e NÃO some da lista', async () => {
    // Sumir esconderia cartões que existem — é o oposto do que esta série
    // inteira quer. A tela decide como rotular; o número continua honesto.
    const { svc } = montarLista({
      agregado: [
        {
          simuladoId: 's-morto',
          cartoes: 2,
          comLeituraConcluida: 1,
          ultimoEnvio: new Date(),
        },
      ],
      nomes: [],
    });

    const r = await svc.listarSimulados({ cursinhoId: 'cur-1' });

    expect(r.simulados).toHaveLength(1);
    expect(r.simulados[0].nome).toBeNull();
    expect(r.simulados[0].cartoes).toBe(2);
  });

  it('pede os nomes SÓ dos ids que o agregado devolveu', async () => {
    const { svc, simuladoRepository } = montarLista({
      agregado: [
        {
          simuladoId: 's1',
          cartoes: 1,
          comLeituraConcluida: 1,
          ultimoEnvio: new Date(),
        },
        {
          simuladoId: 's2',
          cartoes: 1,
          comLeituraConcluida: 0,
          ultimoEnvio: new Date(),
        },
      ],
    });

    await svc.listarSimulados({ cursinhoId: 'cur-1' });

    expect(simuladoRepository.getNomesPorIds).toHaveBeenCalledWith([
      's1',
      's2',
    ]);
  });

  it('repassa o turmaId ao repositório', async () => {
    const { svc, repository } = montarLista();

    await svc.listarSimulados({ cursinhoId: 'cur-1', turmaId: 't-1' });

    expect(repository.listarSimuladosComCartao).toHaveBeenCalledWith({
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('recorte vazio devolve { simulados: [] } e não consulta nome nenhum', async () => {
    const { svc, simuladoRepository } = montarLista({ agregado: [] });

    const r = await svc.listarSimulados({ cursinhoId: 'cur-vazio' });

    expect(r).toEqual({ simulados: [] });
    expect(simuladoRepository.getNomesPorIds).not.toHaveBeenCalled();
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

    /*
      ⚠️ Entrou no card 16: `consultarQuestoes` passou a buscar os
      contadores GLOBAIS da questão — outro ESCOPO, não outro cálculo.
      Mapa vazio por padrão: o service trata a ausência como zero, e é o
      que os testes que não falam de dificuldade global exercitam.
    */
    const questaoRepository = {
      contadoresGlobais: jest.fn().mockResolvedValue(new Map()),
    };
    const svc = new RelatorioSimuladoEstudanteService(
      repository as any,
      simuladoRepository as any,
      questaoRepository as any,
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

describe('RelatorioSimuladoEstudanteService.consultar — nota por matéria (card 02)', () => {
  /**
   * O card 02: `criaAproveitamento` já grava matéria e frente por estudante em
   * todo cartão lido, e o relatório pedia só `aproveitamento.geral`. Faltava
   * `select`, não agregação.
   */
  const MATERIAS = [
    {
      id: 'm-mat',
      nome: 'Matemática',
      aproveitamento: 0.3,
      frentes: [
        {
          id: 'f-arit',
          nome: 'Aritmética',
          materia: 'm-mat',
          aproveitamento: 0.25,
        },
        {
          id: 'f-geo',
          nome: 'Geometria',
          materia: 'm-mat',
          aproveitamento: 0.4,
        },
      ],
    },
    {
      id: 'm-hum',
      nome: 'Humanas',
      aproveitamento: 0.82,
      frentes: [
        {
          id: 'f-hist',
          nome: 'História',
          materia: 'm-hum',
          aproveitamento: 0.82,
        },
      ],
    },
  ];

  const comMaterias = (over: any = {}) =>
    linha({
      ...over,
      historico: {
        aproveitamento: { geral: 0.58, materias: MATERIAS },
        ...over.historico,
      },
    });

  async function primeira(l: any) {
    const { svc } = montar([l]);
    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });
    return r.linhas[0];
  }

  it('devolve matéria e frente de quem tem leitura concluída', async () => {
    const linha0 = await primeira(comMaterias());

    expect(linha0.aproveitamentoPorMateria).toEqual([
      {
        id: 'm-mat',
        nome: 'Matemática',
        aproveitamento: 0.3,
        frentes: [
          { id: 'f-arit', nome: 'Aritmética', aproveitamento: 0.25 },
          { id: 'f-geo', nome: 'Geometria', aproveitamento: 0.4 },
        ],
      },
      {
        id: 'm-hum',
        nome: 'Humanas',
        aproveitamento: 0.82,
        frentes: [{ id: 'f-hist', nome: 'História', aproveitamento: 0.82 }],
      },
    ]);
    expect(linha0.aproveitamentoGeral).toBe(0.58);
  });

  it('⚠️ a frente sai SEM o `materia` que o subdocumento carrega', async () => {
    // A frente já está aninhada na matéria dona: esse id é eco, e são 27 por
    // estudante. Medido: 418 KB → 320 KB em 100 linhas. E é o `map` que faz a
    // rota devolver o que o `@ApiProperty` anuncia — decorator é documentação,
    // não filtro.
    const linha0 = await primeira(comMaterias());

    expect(MATERIAS[0].frentes[0]).toHaveProperty('materia');
    expect(linha0.aproveitamentoPorMateria![0].frentes[0]).not.toHaveProperty(
      'materia',
    );
  });

  it('matéria sem `frentes` não estoura — sai com lista vazia', async () => {
    const linha0 = await primeira(
      linha({
        historico: {
          aproveitamento: {
            geral: 0.5,
            materias: [{ id: 'm', nome: 'M', aproveitamento: 0.5 }],
          },
        },
      }),
    );

    expect(linha0.aproveitamentoPorMateria![0].frentes).toEqual([]);
  });

  it('⚠️ linha `failed` NÃO traz matérias, mesmo com o documento carregando as antigas', async () => {
    // `marcarFalha` não limpa `aproveitamento`: um cartão que completou,
    // reprocessou e falhou carrega a nota da rodada anterior. Devolvê-la
    // afirmaria que a leitura de agora produziu o que ela não produziu.
    const linha0 = await primeira(
      comMaterias({
        historico: {
          status: 'failed',
          aproveitamento: { geral: 0.58, materias: MATERIAS },
        },
      }),
    );

    expect(linha0.aproveitamentoPorMateria).toBeUndefined();
  });

  it('⚠️ linha `failed` também não traz o aproveitamento GERAL', async () => {
    // O card presumia que este gate já existia. Não existia: o ms mandava a
    // nota velha e o client, a exportação e o resumo da api compensavam cada
    // um por sua conta. O gate passa a ser na origem, e os três seguem valendo
    // como defesa em profundidade.
    const linha0 = await primeira(
      comMaterias({ historico: { status: 'failed' } }),
    );

    expect(linha0.aproveitamentoGeral).toBeUndefined();
  });

  it.each(['pending', 'processing', 'awaiting_omr'])(
    'status %s não traz nota nenhuma',
    async (status) => {
      const linha0 = await primeira(comMaterias({ historico: { status } }));

      expect(linha0.aproveitamentoGeral).toBeUndefined();
      expect(linha0.aproveitamentoPorMateria).toBeUndefined();
    },
  );

  it('⚠️ histórico sem `materias` devolve o campo AUSENTE, e não `[]`', async () => {
    // Histórico de antes do `criaAproveitamento`. `[]` faria a tela desenhar
    // barra em zero e afirmar que o aluno zerou todas as matérias.
    const linha0 = await primeira(
      linha({ historico: { aproveitamento: { geral: 0.72 } } }),
    );

    expect(linha0.aproveitamentoPorMateria).toBeUndefined();
    expect('aproveitamentoPorMateria' in linha0).toBe(true);
  });

  it('histórico sem `aproveitamento` nenhum não estoura', async () => {
    const linha0 = await primeira(
      linha({ historico: { aproveitamento: undefined } }),
    );

    expect(linha0.aproveitamentoPorMateria).toBeUndefined();
    expect(linha0.aproveitamentoGeral).toBeUndefined();
  });

  it('⚠️ `materias: []` gravado também vira ausente', async () => {
    // Um cartão lido em que nenhuma questão casou com matéria produz `[]`.
    // Passar adiante daria o mesmo desenho de "zerou tudo" que o caso acima.
    const linha0 = await primeira(
      linha({ historico: { aproveitamento: { geral: 0, materias: [] } } }),
    );

    expect(linha0.aproveitamentoPorMateria).toBeUndefined();
  });
});

describe('RelatorioSimuladoEstudanteService.consultar — acertos absolutos (card 08)', () => {
  /**
   * O card 08: cursinho conversa em ACERTOS, não em percentual — e o percentual
   * sozinho esconde o denominador (58% de 45 e 58% de 180 são confianças
   * diferentes sobre o mesmo número).
   */
  async function primeira(l: any, questoes = 90) {
    const { svc } = montar([l], 30, questoes);
    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });
    return r;
  }

  it('devolve os acertos de quem tem leitura concluída', async () => {
    const r = await primeira(linha({ historico: { acertos: 61 } }));

    expect(r.linhas[0].acertos).toBe(61);
  });

  it('⚠️ o total vem do SIMULADO, e no topo — não repetido por linha', async () => {
    // É propriedade do simulado, não do estudante: repetido em 500 linhas seria
    // dizer 500 vezes a mesma coisa, e abriria a porta para duas discordarem.
    const r = await primeira(linha({ historico: { acertos: 61 } }), 90);

    expect(r.totalDeQuestoes).toBe(90);
    expect(r.linhas[0]).not.toHaveProperty('totalDeQuestoes');
  });

  it('⚠️ o total NÃO sai de `respostas.length`', async () => {
    // São iguais hoje — o `processAnswer` mapeia sobre `simulado.questoes` — e
    // "iguais hoje" é o tipo de coisa que deixa de ser verdade sem ninguém
    // notar. Uma questão removida da prova depois dos cartões lidos já os
    // separaria. Aqui o simulado tem 90 e a linha traz outro número.
    const { svc, simuladoRepository } = montar(
      [linha({ historico: { acertos: 5, respostas: [1, 2, 3] } })],
      30,
      90,
    );

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.totalDeQuestoes).toBe(90);
    expect(simuladoRepository.getNumerosDasQuestoes).toHaveBeenCalledWith(SIM);
  });

  it('simulado que não existe mais devolve total 0, e não estoura', async () => {
    const r = await primeira(linha({ historico: { acertos: 10 } }), 0);

    expect(r.totalDeQuestoes).toBe(0);
  });

  it('⚠️ linha `failed` NÃO traz acertos, mesmo com o campo gravado', async () => {
    // `marcarFalha` não limpa o documento: uma linha que leu bem, reprocessou e
    // falhou carrega os acertos da rodada ANTERIOR.
    const r = await primeira(
      linha({ historico: { status: 'failed', acertos: 61 } }),
    );

    expect(r.linhas[0].acertos).toBeUndefined();
  });

  it.each(['pending', 'processing', 'awaiting_omr'])(
    'status %s não traz acertos',
    async (status) => {
      const r = await primeira(linha({ historico: { status, acertos: 61 } }));

      expect(r.linhas[0].acertos).toBeUndefined();
    },
  );

  it('⚠️ histórico anterior ao card 08 devolve o campo AUSENTE, não 0', async () => {
    // O campo simplesmente não foi gravado. Zero afirmaria que o aluno não
    // acertou nada — e ele tem nota na mesma linha.
    const r = await primeira(
      linha({
        historico: { acertos: undefined, aproveitamento: { geral: 0.7 } },
      }),
    );

    expect(r.linhas[0].acertos).toBeUndefined();
    expect(r.linhas[0].aproveitamentoGeral).toBe(0.7);
  });

  it('⚠️ zero acertos é ZERO, e não ausente', async () => {
    // Cartão lido em que o aluno não acertou nada é uma medida, e diferente de
    // não ter medida. Se o gate confundisse os dois, a distinção que este card
    // inteiro defende iria embora no caso extremo.
    const r = await primeira(linha({ historico: { acertos: 0 } }));

    expect(r.linhas[0].acertos).toBe(0);
  });
});

describe('RelatorioSimuladoEstudanteService.consultar — identificação (card 18)', () => {
  /**
   * O card 18: o cabeçalho da rota era a string fixa "Relatório do simulado", e
   * o payload não trazia nome nenhum. Link colado no WhatsApp, folha impressa e
   * aba esquecida — a página não se identificava em nenhum dos três.
   */
  const montarCom = (opts: {
    linhas?: any[];
    nome?: string | null;
    questoes?: number;
  }) => {
    const repository = {
      buscarPorRecorte: jest.fn().mockResolvedValue(opts.linhas ?? [linha()]),
      contarDoCursinho: jest.fn().mockResolvedValue(30),
    };
    const simuladoRepository = {
      getNumerosDasQuestoes: jest.fn().mockResolvedValue(
        Array.from({ length: opts.questoes ?? 90 }, (_, i) => ({
          questaoId: `q${i}`,
          numero: i + 1,
        })),
      ),
      getNomesPorIds: jest
        .fn()
        .mockResolvedValue(
          opts.nome === null
            ? []
            : [{ id: SIM, nome: opts.nome ?? 'ENEM 2024' }],
        ),
    };

    /*
      ⚠️ Entrou no card 16: `consultarQuestoes` passou a buscar os
      contadores GLOBAIS da questão — outro ESCOPO, não outro cálculo.
      Mapa vazio por padrão: o service trata a ausência como zero, e é o
      que os testes que não falam de dificuldade global exercitam.
    */
    const questaoRepository = {
      contadoresGlobais: jest.fn().mockResolvedValue(new Map()),
    };
    return {
      svc: new RelatorioSimuladoEstudanteService(
        repository as any,
        simuladoRepository as any,
        questaoRepository as any,
      ),
      simuladoRepository,
    };
  };

  it('devolve o nome do simulado', async () => {
    const { svc } = montarCom({ nome: 'ENEM 2024 — 2ª aplicação' });

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.simuladoNome).toBe('ENEM 2024 — 2ª aplicação');
  });

  it('⚠️ simulado apagado devolve `null`, e o relatório NÃO some', async () => {
    // Os cartões continuam existindo; escondê-los é pior que rotulá-los —
    // mesma decisão do `listarSimuladosComCartao`.
    const { svc } = montarCom({ nome: null });

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.simuladoNome).toBeNull();
    expect(r.linhas).toHaveLength(1);
  });

  it('⚠️ reusa o `getNomesPorIds`, e não o `getById`', async () => {
    // O `getById` popularia categoria, frentes e matéria — carga enorme para
    // ler um nome.
    const { svc, simuladoRepository } = montarCom({});

    await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(simuladoRepository.getNomesPorIds).toHaveBeenCalledWith([SIM]);
  });

  describe('a data do último cartão', () => {
    const comData = (iso: string, usuario = 'u1') =>
      ({ ...linha({ usuario }), createdAt: new Date(iso) }) as any;

    it('é a MAIS RECENTE das linhas do recorte', async () => {
      const { svc } = montarCom({
        linhas: [
          comData('2026-09-10T10:00:00Z', 'u1'),
          comData('2026-09-21T15:30:00Z', 'u2'),
          comData('2026-09-14T08:00:00Z', 'u3'),
        ],
      });

      const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

      expect(r.ultimoCartaoEm).toEqual(new Date('2026-09-21T15:30:00Z'));
    });

    it('⚠️ recorte sem cartão devolve `null`, não a data de hoje', async () => {
      const { svc } = montarCom({ linhas: [] });

      const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

      expect(r.ultimoCartaoEm).toBeNull();
    });

    it('linha sem `createdAt` não estoura nem vira data inválida', async () => {
      const { svc } = montarCom({ linhas: [linha()] });

      const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

      expect(r.ultimoCartaoEm).toBeNull();
    });

    it('mistura de linhas com e sem data devolve a que tem', async () => {
      const { svc } = montarCom({
        linhas: [
          linha({ usuario: 'u1' }),
          comData('2026-09-21T15:30:00Z', 'u2'),
        ],
      });

      const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

      expect(r.ultimoCartaoEm).toEqual(new Date('2026-09-21T15:30:00Z'));
    });
  });
});

describe('enxugarMaterias — base por matéria e frente (card 30)', () => {
  const comMaterias = (materias: unknown[]) =>
    montar([
      linha({ historico: { aproveitamento: { geral: 0.5, materias } } }),
    ]);

  const primeira = async (materias: unknown[]) => {
    const { svc } = comMaterias(materias);
    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });
    return r.linhas[0].aproveitamentoPorMateria![0];
  };

  const materia = (over: any = {}) => ({
    id: 'm1',
    nome: 'Matemática',
    aproveitamento: 0.5,
    frentes: [
      {
        id: 'f1',
        nome: 'Álgebra',
        aproveitamento: 0.6,
        materia: 'm1',
        ...over.frente,
      },
    ],
    ...over.materia,
  });

  it('a contagem atravessa em matéria e em frente', async () => {
    const m = await primeira([
      materia({ materia: { questoes: 12 }, frente: { questoes: 5 } }),
    ]);

    expect(m.questoes).toBe(12);
    expect(m.frentes[0].questoes).toBe(5);
  });

  it('⚠️ histórico antigo atravessa SEM a contagem — nunca com zero', async () => {
    /*
      O total nunca foi gravado antes do card 30, e é irrecuperável: o
      `criaAproveitamento` calculava para dividir e descartava. Um `?? 0`
      afirmaria "nenhuma questão desta matéria", e a tela escreveria "de 0
      questões" em todo relatório antigo.
    */
    const m = await primeira([materia()]);

    expect(m.questoes).toBeUndefined();
    expect(m.frentes[0].questoes).toBeUndefined();
  });

  it('o eco de `materia` dentro da frente continua sendo cortado', async () => {
    // O card 02 mediu: 23% do payload só por não repetir o que a posição já diz.
    const m = await primeira([
      materia({ materia: { questoes: 12 }, frente: { questoes: 5 } }),
    ]);

    expect('materia' in m.frentes[0]).toBe(false);
  });
});

describe('RelatorioSimuladoEstudanteService.serieDoEstudante (card 17)', () => {
  const ponto = (simuladoId: string, aproveitamento: number, dia: number) => ({
    simuladoId,
    aproveitamento,
    acertos: Math.round(aproveitamento * 90),
    em: new Date(`2026-0${dia}-10T00:00:00.000Z`),
  });

  const montarSerie = (
    pontos: ReturnType<typeof ponto>[],
    linhasPorSimulado: Record<string, unknown[]> = {},
  ) => {
    const repository = {
      serieDoEstudante: jest.fn().mockResolvedValue(pontos),
      buscarPorRecorte: jest.fn(({ simuladoId }: { simuladoId: string }) =>
        Promise.resolve(linhasPorSimulado[simuladoId] ?? []),
      ),
    };
    const simuladoRepository = {
      getNomesPorIds: jest.fn().mockResolvedValue(
        pontos.map((p) => ({
          id: p.simuladoId,
          nome: `Prova ${p.simuladoId}`,
        })),
      ),
    };
    const questaoRepository = {
      contadoresGlobais: jest.fn().mockResolvedValue(new Map()),
    };
    return {
      svc: new RelatorioSimuladoEstudanteService(
        repository as any,
        simuladoRepository as any,
        questaoRepository as any,
      ),
      repository,
    };
  };

  const comNota = (nota: number) => ({
    historico: { status: 'completed', aproveitamento: { geral: nota } },
  });

  it('devolve os pontos com nome e data', async () => {
    const { svc } = montarSerie([ponto('s1', 0.5, 3)]);

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos[0]).toMatchObject({
      simuladoId: 's1',
      nome: 'Prova s1',
      aproveitamento: 0.5,
      em: '2026-03-10T00:00:00.000Z',
    });
  });

  it('⚠️ traz a média do recorte em CADA ponto', async () => {
    /*
      É o que impede a conclusão errada: dois simulados de dificuldade diferente
      não se comparam por percentual bruto. Cair de 62% para 55% pode ser
      MELHORA, se o segundo foi muito mais difícil — e com as duas linhas juntas
      isso se lê sem normalizar nada.
    */
    const { svc } = montarSerie([ponto('s1', 0.62, 3), ponto('s2', 0.55, 4)], {
      s1: [comNota(0.6), comNota(0.64)],
      // a turma inteira caiu mais que o aluno
      s2: [comNota(0.4), comNota(0.44)],
    });

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos[0].mediaDoRecorte).toBeCloseTo(0.62);
    expect(r.pontos[1].mediaDoRecorte).toBeCloseTo(0.42);
  });

  it('⚠️ a base de cada média vem junto — 27 alunos e 2 desenham o mesmo traço', async () => {
    const { svc } = montarSerie([ponto('s1', 0.5, 3)], {
      s1: [comNota(0.4), comNota(0.6)],
    });

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos[0].baseDoRecorte).toBe(2);
  });

  it('⚠️ recorte sem mais ninguém com leitura dá média `null`, nunca zero', async () => {
    // Zero desenharia a turma no chão e o aluno voando.
    const { svc } = montarSerie([ponto('s1', 0.5, 3)], { s1: [] });

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos[0].mediaDoRecorte).toBeNull();
    expect(r.pontos[0].baseDoRecorte).toBe(0);
  });

  it('⚠️ linha sem leitura concluída não entra na média da turma', async () => {
    const { svc } = montarSerie([ponto('s1', 0.5, 3)], {
      s1: [
        comNota(0.8),
        // `failed` carrega nota VELHA: o `marcarFalha` não limpa o histórico
        { historico: { status: 'failed', aproveitamento: { geral: 0.2 } } },
      ],
    });

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos[0].mediaDoRecorte).toBeCloseTo(0.8);
    expect(r.pontos[0].baseDoRecorte).toBe(1);
  });

  it('estudante sem nenhuma aplicação devolve lista vazia, sem buscar nome', async () => {
    const { svc, repository } = montarSerie([]);

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos).toEqual([]);
    expect(repository.buscarPorRecorte).not.toHaveBeenCalled();
  });

  it('simulado apagado depois do vínculo continua na série, com nome nulo', async () => {
    const { svc } = montarSerie([ponto('s1', 0.5, 3)]);
    // sobrescreve: o nome não veio
    (svc as any).simuladoRepository.getNomesPorIds = jest
      .fn()
      .mockResolvedValue([]);

    const r = await svc.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.pontos).toHaveLength(1);
    expect(r.pontos[0].nome).toBeNull();
  });
});
