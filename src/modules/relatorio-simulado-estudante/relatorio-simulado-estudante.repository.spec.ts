import { Types } from 'mongoose';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';

const HIST_1 = '665f0c1a2b3c4d5e6f00abc1';
const HIST_2 = '665f0c1a2b3c4d5e6f00abc9';
const SIM = '665f0c1a2b3c4d5e6f00abc2';

const montar = () => {
  const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 1 });
  const repo = new RelatorioSimuladoEstudanteRepository({ updateOne } as any);
  return { repo, updateOne };
};

describe('RelatorioSimuladoEstudanteRepository.registrar', () => {
  it('grava o vínculo com refs de verdade, não strings', async () => {
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    const [filtro, update, opcoes] = updateOne.mock.calls[0];
    // uma string aqui passaria por um toString() — exigimos o tipo
    expect(update.$set.historico).toBeInstanceOf(Types.ObjectId);
    expect(update.$set.historico.toString()).toBe(HIST_1);
    expect(filtro.simulado).toBeInstanceOf(Types.ObjectId);
    expect(filtro.simulado.toString()).toBe(SIM);
    expect(filtro.cursinhoId).toBe('cur-1');
    expect(filtro.usuario).toBe('u1');
    expect(update.$set.turmaId).toBe('t-1');
    expect(opcoes).toEqual({ upsert: true });
  });

  it('a chave do upsert é o estudante, não o histórico', async () => {
    // senão o reenvio depois de uma falha criaria uma segunda linha
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    expect(Object.keys(updateOne.mock.calls[0][0]).sort()).toEqual([
      'cursinhoId',
      'simulado',
      'usuario',
    ]);
  });

  it('reenvio aponta a MESMA linha para o histórico novo', async () => {
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });
    await repo.registrar({
      historicoId: HIST_2,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    const [f1] = updateOne.mock.calls[0];
    const [f2, u2] = updateOne.mock.calls[1];
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2)); // mesmo alvo
    expect(u2.$set.historico.toString()).toBe(HIST_2); // tentativa atual
  });

  it('aceita estudante sem turma', async () => {
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    expect(updateOne.mock.calls[0][1].$set.turmaId).toBeUndefined();
  });
});

describe('RelatorioSimuladoEstudanteRepository.buscarPorRecorte', () => {
  const montarBusca = () => {
    const chain: any = {};
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.lean = jest.fn().mockReturnValue(chain);
    chain.exec = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue(chain);
    const repo = new RelatorioSimuladoEstudanteRepository({ find } as any);
    return { repo, find, chain };
  };

  it('filtra por simulado e cursinho', async () => {
    const { repo, find } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const filtro = find.mock.calls[0][0];
    expect(filtro.simulado).toBeInstanceOf(Types.ObjectId);
    expect(filtro.simulado.toString()).toBe(SIM);
    expect(filtro.cursinhoId).toBe('cur-1');
  });

  it('sem turmaId, a chave nem aparece no filtro', async () => {
    // { turmaId: undefined } no Mongo casa TODOS os documentos, não os sem turma
    const { repo, find } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect('turmaId' in find.mock.calls[0][0]).toBe(false);
  });

  it('com turmaId, restringe à turma', async () => {
    const { repo, find } = montarBusca();

    await repo.buscarPorRecorte({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    expect(find.mock.calls[0][0].turmaId).toBe('t-1');
  });

  it('popula o histórico com select explícito, não o documento inteiro', async () => {
    // respostas de 90 questões × 500 estudantes é carga que nenhuma tela desta série usa
    const { repo, chain } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const populate = chain.populate.mock.calls[0][0];
    expect(populate.path).toBe('historico');
    // ⚠️ `aproveitamento` INTEIRO desde o card 02 (antes era só `.geral`): a
    // nota por matéria e frente já estava gravada e só faltava pedi-la.
    expect(populate.select).toEqual(expect.stringContaining('aproveitamento'));
    // ⚠️ Esta é a guarda que importa e que não pode afrouxar nunca — é o custo
    // que o docblock do `CAMPOS_DO_HISTORICO` existe para barrar.
    expect(populate.select).not.toContain('respostas');
  });

  it('⚠️ o select é de campos EXPLÍCITOS, não o documento inteiro', async () => {
    // Um select vazio (ou ausente) traria `respostas` junto e passaria no
    // `not.toContain` acima sem que nada tivesse sido pedido — o teste ficaria
    // verde justamente no cenário que ele existe para impedir.
    const { repo, chain } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const { select } = chain.populate.mock.calls[0][0];
    expect(typeof select).toBe('string');
    expect(select.split(/\s+/).filter(Boolean).length).toBeGreaterThan(1);
  });
});

describe('RelatorioSimuladoEstudanteRepository.contarDoCursinho', () => {
  it('conta escopado no cursinho, nunca global', async () => {
    const countDocuments = jest.fn().mockResolvedValue(30);
    const repo = new RelatorioSimuladoEstudanteRepository({
      countDocuments,
    } as any);

    const total = await repo.contarDoCursinho(SIM, 'cur-1');

    expect(total).toBe(30);
    const filtro = countDocuments.mock.calls[0][0];
    expect(filtro.cursinhoId).toBe('cur-1');
    expect(filtro.simulado.toString()).toBe(SIM);
    // sem o cursinho, o número diria a um cursinho quantos cartões os outros enviaram
    expect(Object.keys(filtro).sort()).toEqual(['cursinhoId', 'simulado']);
  });
});

describe('RelatorioSimuladoEstudanteRepository.agregarPorQuestao', () => {
  const montarAgg = () => {
    const aggregate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });
    const repo = new RelatorioSimuladoEstudanteRepository({ aggregate } as any);
    return { repo, aggregate };
  };

  const estagio = (pipeline: any[], chave: string) =>
    pipeline.find((e) => Object.keys(e)[0] === chave);

  it('impõe o recorte no $match, igual à consulta por linha', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const match = estagio(aggregate.mock.calls[0][0], '$match').$match;
    expect(match.simulado.toString()).toBe(SIM);
    expect(match.cursinhoId).toBe('cur-1');
    // mesma armadilha do card 02: `{turmaId: undefined}` casaria só quem não tem turma
    expect('turmaId' in match).toBe(false);
  });

  it('com turmaId, restringe a agregação à turma', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    expect(estagio(aggregate.mock.calls[0][0], '$match').$match.turmaId).toBe(
      't-1',
    );
  });

  it('junta com a coleção historicos', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const lookup = estagio(aggregate.mock.calls[0][0], '$lookup').$lookup;
    expect(lookup.from).toBe('historicos');
    expect(lookup.localField).toBe('historico');
    expect(lookup.foreignField).toBe('_id');
  });

  it('filtra por status completed — respostas velhas de um failed não votam', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const matches = aggregate.mock.calls[0][0].filter((e: any) => e.$match);
    expect(matches.some((e: any) => e.$match['h.status'] === 'completed')).toBe(
      true,
    );
  });

  it('NÃO preserva vazios no $unwind — cartão sem leitura não vota', async () => {
    // com preserveNullAndEmptyArrays, um histórico failed (sem `respostas`)
    // entraria como respondente de todas as questões
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    for (const e of aggregate.mock.calls[0][0]) {
      if (e.$unwind) {
        expect(e.$unwind.preserveNullAndEmptyArrays).toBeFalsy();
      }
    }
  });
});

describe('RelatorioSimuladoEstudanteRepository.serieDoEstudante (card 17)', () => {
  const linha = (over: Record<string, unknown> = {}) => ({
    simulado: { toString: () => 's1' },
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    historico: {
      status: 'completed',
      aproveitamento: { geral: 0.5 },
      acertos: 45,
    },
    ...over,
  });

  const montar = (linhas: unknown[]) => {
    const exec = jest.fn().mockResolvedValue(linhas);
    const lean = jest.fn().mockReturnValue({ exec });
    const populate = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ populate });
    return {
      repo: new RelatorioSimuladoEstudanteRepository({ find } as any),
      find,
    };
  };

  it('devolve o ponto com nota, acertos e data da junção', async () => {
    const { repo } = montar([linha()]);

    const r = await repo.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r).toEqual([
      {
        simuladoId: 's1',
        aproveitamento: 0.5,
        acertos: 45,
        em: new Date('2026-03-10T00:00:00.000Z'),
      },
    ]);
  });

  it('⚠️ leitura NÃO concluída não vira ponto', async () => {
    /*
      O gráfico é sobre subir e descer: um ponto fantasma em zero desenha uma
      queda que não aconteceu. E `failed` carrega nota VELHA — o `marcarFalha`
      não limpa o histórico —, então filtrar pela presença da nota não basta.
    */
    const { repo } = montar([
      linha({
        historico: {
          status: 'failed',
          aproveitamento: { geral: 0.2 },
          acertos: 18,
        },
      }),
      linha({ historico: { status: 'awaiting_omr' } }),
    ]);

    const r = await repo.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r).toEqual([]);
  });

  it('histórico apagado depois do vínculo não vira ponto', async () => {
    const { repo } = montar([linha({ historico: null })]);

    await expect(
      repo.serieDoEstudante({ cursinhoId: 'cur-1', usuario: 'u1' }),
    ).resolves.toEqual([]);
  });

  it('⚠️ ordena por data — a série é sobre a ordem', async () => {
    const { repo } = montar([
      linha({
        simulado: { toString: () => 'depois' },
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      }),
      linha({
        simulado: { toString: () => 'antes' },
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ]);

    const r = await repo.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.map((p) => p.simuladoId)).toEqual(['antes', 'depois']);
  });

  it('⚠️ o recorte e o usuário entram no filtro', async () => {
    // Reimplementar o filtro aqui abriria a porta para esta rota enxergar
    // cursinho que as outras não enxergam.
    const { repo, find } = montar([]);

    await repo.serieDoEstudante({
      cursinhoId: 'cur-1',
      usuario: 'u1',
      turmaId: 't-9',
    });

    expect(find).toHaveBeenCalledWith({
      cursinhoId: 'cur-1',
      turmaId: 't-9',
      usuario: 'u1',
    });
  });
});
