import { QuestaoRepository } from './questao.repository';

describe('QuestaoRepository.setProvaBase (atualiza campo provaBase com session)', () => {
  function makeRepoWithUpdateOne() {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const questaoModel: any = { updateOne };
    const provaModel: any = {};
    return { repo: new QuestaoRepository(questaoModel, provaModel, {} as any), updateOne };
  }

  it('chama model.updateOne com filtro _id, payload provaBase e session quando session é passada', async () => {
    const { repo, updateOne } = makeRepoWithUpdateOne();
    const session = {} as any;
    await repo.setProvaBase('q1', 'p1', session);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'q1' },
      { provaBase: 'p1' },
      { session },
    );
  });

  it('aceita null como provaBase e passa null no payload para model.updateOne', async () => {
    const { repo, updateOne } = makeRepoWithUpdateOne();
    const session = {} as any;
    await repo.setProvaBase('q1', null, session);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'q1' },
      { provaBase: null },
      { session },
    );
  });
});

describe('QuestaoRepository.canInsertQuestion (reverse-lookup em Prova.questoes)', () => {
  function makeRepo(prova: any) {
    const exec = jest.fn().mockResolvedValue(prova);
    const populate = jest.fn().mockReturnValue({ exec });
    const findById = jest.fn().mockReturnValue({ populate });
    const questaoModel: any = {};
    const provaModel: any = { findById };
    return {
      repo: new QuestaoRepository(questaoModel, provaModel, {} as any),
      findById,
      populate,
    };
  }

  it('retorna false quando já existe entry com o mesmo numero+frente1', async () => {
    const { repo } = makeRepo({
      questoes: [{ numero: 5, questao: { frente1: 'f1' } }],
    });
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(false);
  });

  it('retorna true quando o numero está livre', async () => {
    const { repo } = makeRepo({
      questoes: [{ numero: 6, questao: { frente1: 'f1' } }],
    });
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(true);
  });

  it('retorna true quando o numero existe mas com outra frente1 (idiomática)', async () => {
    const { repo } = makeRepo({
      questoes: [{ numero: 5, questao: { frente1: 'fx' } }],
    });
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(true);
  });

  it('retorna true quando a prova não existe', async () => {
    const { repo } = makeRepo(null);
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(true);
  });
});

describe('QuestaoRepository.updateQuestionAnswered (contadores globais — card 21)', () => {
  const montar = () => {
    const bulkWrite = jest.fn().mockResolvedValue({});
    return {
      repo: new QuestaoRepository({ bulkWrite } as any, {} as any, {} as any),
      bulkWrite,
    };
  };

  /** O `$inc` de uma questão, ou `undefined` se ela não foi escrita. */
  const incDe = (bulkWrite: jest.Mock, id: string) =>
    (bulkWrite.mock.calls[0]?.[0] ?? []).find(
      (op: any) => op.updateOne.filter._id === id,
    )?.updateOne.update.$inc;

  /*
    ⚠️ **Sem valor padrão no gabarito, de propósito.** Com `= 'A'`, passar
    `undefined` explicitamente cai no default — o teste de "questão sem
    gabarito" passava a exercitar uma questão COM gabarito e falhava por um
    motivo que não era o testado. Os dois últimos argumentos são sempre
    escritos à mão.
  */
  const resposta = (
    id: string,
    alternativaEstudante: string | undefined,
    alternativaCorreta: string | undefined,
  ) =>
    ({
      questao: { _id: id },
      alternativaEstudante,
      alternativaCorreta,
    }) as never;

  it('conta a resposta e o acerto de quem marcou a correta', async () => {
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered([resposta('q1', 'A', 'A')]);

    expect(incDe(bulkWrite, 'q1')).toEqual({
      quantidadeResposta: 1,
      acertos: 1,
    });
  });

  it('quem marcou errado conta resposta e não conta acerto', async () => {
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered([resposta('q1', 'B', 'A')]);

    expect(incDe(bulkWrite, 'q1')).toEqual({ quantidadeResposta: 1 });
  });

  it('⚠️ questão EM BRANCO não entra na contagem', async () => {
    /*
      Era o defeito nº 1. O chamador monta a lista sobre TODAS as questões do
      simulado, com `alternativaEstudante` indefinido para quem não marcou —
      antes, toda questão da prova levava +1 e o campo virava contagem de
      APRESENTAÇÕES com nome de contagem de respostas.
    */
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered([
      resposta('q1', 'A', 'A'),
      resposta('q2', undefined, 'A'),
    ]);

    expect(incDe(bulkWrite, 'q1')).toEqual({
      quantidadeResposta: 1,
      acertos: 1,
    });
    expect(incDe(bulkWrite, 'q2')).toBeUndefined();
  });

  it('questão sem gabarito E sem marcação não escreve nada', async () => {
    /*
      ⚠️ **Este teste NÃO cobre a guarda de gabarito, e é importante dizer.** O
      caso `undefined === undefined` — que o card 08 encontrou do outro lado —
      exige `alternativaEstudante` indefinido, e aí a guarda de "em branco" já
      descartou a resposta antes. A mutação que remove
      `alternativaCorreta !== undefined` SOBREVIVE, e o docblock do repositório
      explica por que a guarda fica mesmo assim.

      O que este teste afirma é o que ele alcança: nada é escrito.
    */
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered([resposta('q1', undefined, undefined)]);

    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('⚠️ resposta marcada em questão sem gabarito conta resposta, não acerto', async () => {
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered([resposta('q1', 'A', undefined)]);

    expect(incDe(bulkWrite, 'q1')).toEqual({ quantidadeResposta: 1 });
  });

  it('⚠️ reprocessar DESCONTA a contagem anterior', async () => {
    /*
      Era o defeito nº 3. `$inc` puro não é idempotente, e
      `prepararParaProcessamento` devolve o histórico a `Pending` — o caminho do
      reenvio de foto. Sem o desconto, o mesmo cartão contava duas vezes.
    */
    const { repo, bulkWrite } = montar();

    // A leitura anterior acertou q1; a nova também. Saldo: nada muda.
    await repo.updateQuestionAnswered(
      [resposta('q1', 'A', 'A')],
      [resposta('q1', 'A', 'A')],
    );

    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('⚠️ reprocessar com resposta DIFERENTE aplica só a diferença', async () => {
    /*
      É o que distingue descontar de pular. A foto nova leu 'A' onde a anterior
      leu 'B': a contagem de respostas não muda, mas o acerto passa a existir.
    */
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered(
      [resposta('q1', 'A', 'A')],
      [resposta('q1', 'B', 'A')],
    );

    expect(incDe(bulkWrite, 'q1')).toEqual({ acertos: 1 });
  });

  it('⚠️ questão que a foto nova NÃO leu perde a contagem antiga', async () => {
    // A leitura anterior tinha lido q2; a nova não leu. O contador tem de voltar.
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered(
      [resposta('q1', 'A', 'A'), resposta('q2', undefined, 'A')],
      [resposta('q1', 'A', 'A'), resposta('q2', 'A', 'A')],
    );

    expect(incDe(bulkWrite, 'q2')).toEqual({
      quantidadeResposta: -1,
      acertos: -1,
    });
  });

  it('⚠️ aceita `questao` como ObjectId cru, e não só como objeto populado', async () => {
    /*
      **Medido no Mongo de homologação:** `historico.respostas[].questao` é
      `objectId` nas 2.230 linhas — o documento relido não traz o objeto
      populado. `resposta.questao._id` daria `undefined` e o filtro casaria com
      nada, o que faria o desconto sumir em silêncio.
    */
    const { repo, bulkWrite } = montar();
    const cru = { toString: () => 'q9' };

    await repo.updateQuestionAnswered([
      {
        questao: cru,
        alternativaEstudante: 'A',
        alternativaCorreta: 'A',
      } as never,
    ]);

    expect(incDe(bulkWrite, 'q9')).toEqual({
      quantidadeResposta: 1,
      acertos: 1,
    });
  });

  it('⚠️ nada a escrever não chama bulkWrite — o driver estoura com lista vazia', async () => {
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered([]);

    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('um único bulkWrite cobre desconto e aplicação', async () => {
    // Duas chamadas deixariam uma janela em que o contador está negativo.
    const { repo, bulkWrite } = montar();

    await repo.updateQuestionAnswered(
      [resposta('q1', 'A', 'A')],
      [resposta('q2', 'A', 'A')],
    );

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    expect(bulkWrite.mock.calls[0][0]).toHaveLength(2);
  });
});

describe('QuestaoRepository.contadoresGlobais (card 16)', () => {
  const montar = (docs: unknown[]) => {
    const exec = jest.fn().mockResolvedValue(docs);
    const lean = jest.fn().mockReturnValue({ exec });
    const find = jest.fn().mockReturnValue({ lean });
    return { repo: new QuestaoRepository({ find } as any, {} as any, {} as any), find };
  };

  /*
    ⚠️ **Id hex de 24 caracteres, e não `'q1'` como nos outros fixtures deste
    arquivo.** O método converte para `Types.ObjectId`, e um id inválido estoura
    `BSONError` — o que derrubaria a aba de Questões inteira, não só uma linha.

    Não há guarda, e é decisão: os ids chegam do `agregarPorQuestao`, que os
    produz de um `$group` sobre `respostas.questao` — sempre `ObjectId`. Blindar
    aqui esconderia um defeito de quem chamasse errado.
  */
  const ID = '665f0c1a2b3c4d5e6f00abc2';

  it('devolve o par (acertos, respostas) indexado por id', async () => {
    const { repo } = montar([
      { _id: ID, acertos: 443, quantidadeResposta: 1847 },
    ]);

    const mapa = await repo.contadoresGlobais([ID]);

    expect(mapa.get(ID)).toEqual({
      acertos: 443,
      quantidadeResposta: 1847,
      // ⚠️ Card 29: `origem` ausente = questão original, não versão.
      ehVersao: false,
    });
  });

  it('⚠️ campo ausente vira zero — ninguém respondeu É uma afirmação', async () => {
    // Diferente do `null` que a TELA usa para "base pequena demais para dizer".
    const { repo } = montar([{ _id: ID }]);

    const mapa = await repo.contadoresGlobais([ID]);

    expect(mapa.get(ID)).toEqual({
      acertos: 0,
      quantidadeResposta: 0,
      ehVersao: false,
    });
  });

  it('⚠️ projeta só o mínimo — a Questao carrega enunciado e assets', async () => {
    // São até 180 questões por relatório; trazer o corpo inteiro para ler três
    // campos é carga enorme num caminho que a tela abre a cada relatório.
    const { repo, find } = montar([]);

    await repo.contadoresGlobais(['665f0c1a2b3c4d5e6f00abc2']);

    expect(find.mock.calls[0][1]).toEqual({
      acertos: 1,
      quantidadeResposta: 1,
      // ⚠️ Card 29 — explica a base pequena, não soma nada.
      origem: 1,
    });
  });

  it('⚠️ questão COM `origem` é marcada como versão', async () => {
    /*
      Card 29: a contagem é da QUESTÃO, não da linhagem — "correção" edita
      in-place e só "nova versão" cria entidade nova, então toda versão nasce de
      mudança substantiva e somar a família somaria textos diferentes.

      Este booleano existe para a tela EXPLICAR a base pequena, não para somar.
    */
    const { repo } = montar([
      { _id: ID, acertos: 4, quantidadeResposta: 12, origem: 'q0' },
    ]);

    expect((await repo.contadoresGlobais([ID])).get(ID)?.ehVersao).toBe(true);
  });

  it('lista vazia não consulta o banco', async () => {
    const { repo, find } = montar([]);

    await expect(repo.contadoresGlobais([])).resolves.toEqual(new Map());
    expect(find).not.toHaveBeenCalled();
  });
});

describe('QuestaoRepository — linhagem (card 25)', () => {
  it('⚠️ `getParaDuplicar` pede o gabarito explicitamente', async () => {
    /*
      `alternativa` é `@Prop({ select: false })`: sem o `+alternativa` a cópia
      nasceria sem gabarito, em silêncio.
    */
    const exec = jest.fn().mockResolvedValue({ _id: 'q1' });
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    const findById = jest.fn().mockReturnValue({ select });
    const repo = new QuestaoRepository({ findById } as any, {} as any, {} as any);

    await repo.getParaDuplicar('q1');

    expect(select).toHaveBeenCalledWith('+alternativa');
  });

  it('⚠️ `getParaDuplicar` usa `.lean()` — documento hidratado traz internos', async () => {
    // O `documentoDaCopia` itera `Object.entries`, e num documento do Mongoose
    // isso traz métodos e internos em vez dos campos.
    const exec = jest.fn().mockResolvedValue({ _id: 'q1' });
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    const findById = jest.fn().mockReturnValue({ select });
    const repo = new QuestaoRepository({ findById } as any, {} as any, {} as any);

    await repo.getParaDuplicar('q1');

    expect(lean).toHaveBeenCalled();
  });

  it('⚠️ as cópias são DERIVADAS de `origem`, não lidas de um array', async () => {
    /*
      Decisão contra o doc 10 da #61: uma lista denormalizada de filhas é o
      padrão que os cards 21 e 22 mostraram que erra — 0 de 181 questões tinham
      os contadores incrementais batendo com o histórico. Aqui não há segunda
      cópia da verdade para divergir.
    */
    const exec = jest
      .fn()
      .mockResolvedValue([{ _id: 'q2', status: 'Pending', origem: 'q1' }]);
    const lean = jest.fn().mockReturnValue({ exec });
    const find = jest.fn().mockReturnValue({ lean });
    const repo = new QuestaoRepository({ find } as any, {} as any, {} as any);

    const r = await repo.listarCopias('q1');

    expect(find.mock.calls[0][0]).toEqual({ origem: 'q1' });
    expect(r).toEqual([{ id: 'q2', status: 'Pending', origem: 'q1' }]);
  });

  it('projeta só o que a lista de cópias mostra', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const lean = jest.fn().mockReturnValue({ exec });
    const find = jest.fn().mockReturnValue({ lean });
    const repo = new QuestaoRepository({ find } as any, {} as any, {} as any);

    await repo.listarCopias('q1');

    expect(find.mock.calls[0][1]).toEqual({ status: 1, origem: 1 });
  });
});

describe('QuestaoRepository.substituirQuestao (card 26)', () => {
  const montar = () => {
    const provaUpdate = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 3 }) });
    const simuladoUpdate = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 5 }) });
    const repo = new QuestaoRepository(
      {} as any,
      { updateMany: provaUpdate } as any,
      { updateMany: simuladoUpdate } as any,
    );
    return { repo, provaUpdate, simuladoUpdate };
  };

  const DE = '665f0c1a2b3c4d5e6f00abc1';
  const PARA = '665f0c1a2b3c4d5e6f00abc2';

  it('⚠️ escreve nas DUAS coleções', async () => {
    /*
      `Prova.questoes` e `Simulado.questoes` são arrays independentes. Trocar só
      numa deixaria a prova com a sucessora e o simulado com a original
      congelada — e o aluno responderia o texto velho.
    */
    const { repo, provaUpdate, simuladoUpdate } = montar();

    const r = await repo.substituirQuestao(DE, PARA);

    expect(provaUpdate).toHaveBeenCalledTimes(1);
    expect(simuladoUpdate).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ provas: 3, simulados: 5 });
  });

  it('⚠️ substitui no LUGAR — o `numero` da entry não é tocado', async () => {
    /*
      Remover e adicionar passaria pela validação da factory, que pode recusar
      (número ocupado, regra ENEM) e deixar a prova SEM a questão.
    */
    const { repo, provaUpdate } = montar();

    await repo.substituirQuestao(DE, PARA);

    const update = provaUpdate.mock.calls[0][1];
    expect(Object.keys(update)).toEqual(['$set']);
    expect(Object.keys(update.$set)).toEqual(['questoes.$[alvo].questao']);
    // nada de `$pull`/`$push`, que é o caminho que perderia o número
    expect(JSON.stringify(update)).not.toContain('$pull');
  });

  it('o arrayFilter mira exatamente a questão antiga', async () => {
    const { repo, provaUpdate } = montar();

    await repo.substituirQuestao(DE, PARA);

    const opcoes = provaUpdate.mock.calls[0][2];
    expect(String(opcoes.arrayFilters[0]['alvo.questao'])).toBe(DE);
  });

  it('o filtro só atinge quem contém a questão', async () => {
    const { repo, provaUpdate } = montar();

    await repo.substituirQuestao(DE, PARA);

    expect(String(provaUpdate.mock.calls[0][0]['questoes.questao'])).toBe(DE);
  });
});

describe('QuestaoRepository.congelar (card 26)', () => {
  it('marca só o campo `congelada`', async () => {
    const updateOne = jest.fn().mockResolvedValue({});
    const repo = new QuestaoRepository({ updateOne } as any, {} as any, {} as any);

    await repo.congelar('q1');

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'q1' },
      { $set: { congelada: true } },
    );
  });
});
