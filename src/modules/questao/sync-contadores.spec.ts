import {
  ContadoresDaQuestao,
  operacoesDeEscrita,
  PIPELINE_RESPOSTAS,
  PIPELINE_SIMULADOS,
  planoDeSync,
  QUANTAS_MAIORES,
} from './sync-contadores';

const atual = (
  quantidadeResposta: number,
  acertos: number,
  quantidadeSimulado = 0,
): Partial<ContadoresDaQuestao> => ({
  quantidadeResposta,
  acertos,
  quantidadeSimulado,
});

describe('planoDeSync (card 22)', () => {
  it('questão já correta não vira escrita', () => {
    const plano = planoDeSync(
      new Map([['q1', atual(10, 4, 2)]]),
      new Map([['q1', { quantidadeResposta: 10, acertos: 4 }]]),
      new Map([['q1', 2]]),
    );

    expect(plano.operacoes).toEqual([]);
    expect(plano.resumo.divergentes).toBe(0);
  });

  it('corrige os três campos de uma vez', () => {
    const plano = planoDeSync(
      new Map([['q1', atual(30, 1, 0)]]),
      new Map([['q1', { quantidadeResposta: 12, acertos: 4 }]]),
      new Map([['q1', 3]]),
    );

    expect(plano.operacoes).toEqual([
      {
        id: 'q1',
        de: { quantidadeResposta: 30, acertos: 1, quantidadeSimulado: 0 },
        para: { quantidadeResposta: 12, acertos: 4, quantidadeSimulado: 3 },
      },
    ]);
  });

  it('⚠️ questão com contador e SEM nenhuma resposta vai a zero', () => {
    /*
      É o caso que o card manda não deixar passar. Iterar sobre o resultado do
      `$group` — que é o caminho óbvio — pularia exatamente as piores: uma
      questão com contador 5 e nenhuma linha no histórico é justamente a que
      está mais errada, e ela não aparece no `$group`.
    */
    const plano = planoDeSync(
      new Map([['q1', atual(5, 2, 0)]]),
      new Map(),
      new Map(),
    );

    expect(plano.operacoes[0].para).toEqual({
      quantidadeResposta: 0,
      acertos: 0,
      quantidadeSimulado: 0,
    });
  });

  it('⚠️ campo AUSENTE no documento conta como zero, e não como divergência', () => {
    /*
      Questão antiga pode não ter `quantidadeSimulado` gravado. Sem o `?? 0` por
      campo, `undefined !== 0` marcaria como divergente uma questão que já está
      certa — e o número de divergentes, que é a linha de base do card 16,
      viria inflado.
    */
    const plano = planoDeSync(
      new Map([['q1', { quantidadeResposta: 0, acertos: 0 }]]),
      new Map(),
      new Map(),
    );

    expect(plano.operacoes).toEqual([]);
  });

  it('⚠️ questão que existe só no histórico NÃO é criada', () => {
    // Resposta órfã (questão apagada depois da aplicação) não pode ressuscitar
    // um documento. O plano parte das questões, não dos agregados.
    const plano = planoDeSync(
      new Map(),
      new Map([['fantasma', { quantidadeResposta: 9, acertos: 3 }]]),
      new Map(),
    );

    expect(plano.operacoes).toEqual([]);
    expect(plano.resumo.questoes).toBe(0);
  });

  it('o resumo conta as questões varridas, não só as divergentes', () => {
    const plano = planoDeSync(
      new Map([
        ['q1', atual(0, 0, 0)],
        ['q2', atual(5, 0, 0)],
      ]),
      new Map(),
      new Map(),
    );

    expect(plano.resumo.questoes).toBe(2);
    expect(plano.resumo.divergentes).toBe(1);
  });

  it('as maiores divergências vêm ordenadas pela diferença em respostas', () => {
    const plano = planoDeSync(
      new Map([
        ['pequena', atual(1, 0, 0)],
        ['grande', atual(100, 0, 0)],
        ['media', atual(10, 0, 0)],
      ]),
      new Map(),
      new Map(),
    );

    expect(plano.resumo.maiores.map((o) => o.id)).toEqual([
      'grande',
      'media',
      'pequena',
    ]);
  });

  it(`a lista de maiores para em ${QUANTAS_MAIORES}`, () => {
    const atuais = new Map(
      Array.from({ length: 50 }, (_, i) => [`q${i}`, atual(i + 1, 0, 0)]),
    );

    const plano = planoDeSync(atuais, new Map(), new Map());

    expect(plano.resumo.divergentes).toBe(50);
    expect(plano.resumo.maiores).toHaveLength(QUANTAS_MAIORES);
  });

  it('⚠️ rodar duas vezes no resultado da primeira não produz escrita nenhuma', () => {
    /*
      A idempotência é o que distingue este script do `$inc` que produziu o
      estado a consertar. Aqui ela é verificada aplicando o plano e recalculando.
    */
    const atuais = new Map([['q1', atual(30, 1, 0)]]);
    const respondidas = new Map([
      ['q1', { quantidadeResposta: 12, acertos: 4 }],
    ]);
    const emSimulados = new Map([['q1', 3]]);

    const primeiro = planoDeSync(atuais, respondidas, emSimulados);
    // aplica
    const depois = new Map([['q1', primeiro.operacoes[0].para]]);

    const segundo = planoDeSync(depois, respondidas, emSimulados);

    expect(segundo.operacoes).toEqual([]);
  });
});

describe('operacoesDeEscrita', () => {
  const plano = planoDeSync(
    new Map([['q1', atual(30, 1, 0)]]),
    new Map([['q1', { quantidadeResposta: 12, acertos: 4 }]]),
    new Map([['q1', 3]]),
  );

  it('⚠️ usa $set, e nunca $inc', () => {
    // É o que torna o sync idempotente. O `$inc` foi o que produziu o estado
    // que este script existe para consertar.
    const ops = operacoesDeEscrita(plano);

    expect(ops[0].updateOne.update).toEqual({
      $set: { quantidadeResposta: 12, acertos: 4, quantidadeSimulado: 3 },
    });
  });

  it('⚠️ o id passa pelo conversor — com string crua o filtro não casa com nada', () => {
    /*
      O driver NATIVO não casta `_id`. Um filtro `{ _id: '66...' }` contra um
      `_id` `ObjectId` não casa, o `bulkWrite` termina sem erro com
      `matchedCount: 0`, e o script diz "concluído" sem ter escrito uma linha.
    */
    const paraId = jest.fn((id: string) => ({ oid: id }));

    const ops = operacoesDeEscrita(plano, paraId);

    expect(paraId).toHaveBeenCalledWith('q1');
    expect(ops[0].updateOne.filter._id).toEqual({ oid: 'q1' });
  });

  it('plano vazio não produz operação', () => {
    const vazio = planoDeSync(new Map(), new Map(), new Map());

    expect(operacoesDeEscrita(vazio)).toEqual([]);
  });
});

describe('PIPELINE_RESPOSTAS', () => {
  const match = PIPELINE_RESPOSTAS[0].$match as Record<string, unknown>;

  it('⚠️ histórico SEM status entra — são os documentos antigos', () => {
    /*
      Em homologação são 42 documentos anteriores ao enum, com 2.025 das 2.230
      linhas de resposta. `$ne: 'failed'` os inclui; `$eq: 'completed'` os
      excluiria, e a base de uma questão antiga despencaria sem que nada
      tivesse mudado.
    */
    expect(match.status).toEqual({ $ne: 'failed' });
  });

  it('⚠️ `failed` fica de fora explicitamente', () => {
    // `marcarFalha` NÃO limpa as `respostas` de uma leitura anterior — fato já
    // registrado nos cards 12, 13 e 15. Sem o gate, a leitura velha contaria.
    expect(JSON.stringify(match.status)).toContain('failed');
  });

  it('exige ao menos uma resposta, para não varrer histórico vazio', () => {
    expect(match['respostas.0']).toEqual({ $exists: true });
  });

  it('⚠️ conta só quem MARCOU — a mesma regra do card 21', () => {
    /*
      Duas regras diferentes para o mesmo campo fariam o sync "corrigir" o que a
      escrita acabou de gravar certo, para sempre.
    */
    const filtro = (PIPELINE_RESPOSTAS[2] as any).$match;

    expect(filtro['respostas.alternativaEstudante']).toEqual({
      $nin: [null, ''],
    });
  });

  it('agrupa pela questão da resposta', () => {
    const group = (PIPELINE_RESPOSTAS[3] as any).$group;

    expect(group._id).toBe('$respostas.questao');
  });

  it('⚠️ o acerto usa o gabarito DA LINHA, não o da questão hoje', () => {
    /*
      `respostas[].alternativaCorreta` é o gabarito do momento da correção. É
      isso que torna a reconstrução fiel: uma questão cujo gabarito mudou depois
      continua contando os acertos pelo gabarito com que foi corrigida.
    */
    const group = JSON.stringify((PIPELINE_RESPOSTAS[3] as any).$group);

    expect(group).toContain('$respostas.alternativaCorreta');
    expect(group).not.toContain('$questao.alternativa');
  });
});

describe('PIPELINE_SIMULADOS', () => {
  it('conta sobre simulados.questoes, não sobre provas', () => {
    // É a coleção que o `processAnswer` lê para montar a prova do aluno.
    expect((PIPELINE_SIMULADOS[0] as any).$unwind).toBe('$questoes');
    expect((PIPELINE_SIMULADOS[1] as any).$group._id).toBe('$questoes.questao');
  });
});
