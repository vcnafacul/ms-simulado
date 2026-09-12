import { CadernoTemplateRepository } from './caderno-template.repository';

function repoCom(overrides: Record<string, unknown> = {}) {
  const model = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    startSession: jest.fn(),
    ...overrides,
  } as any;
  return { model, repo: new CadernoTemplateRepository(model) };
}

const comExec = (valor: unknown) => ({
  exec: jest.fn().mockResolvedValue(valor),
});

describe('CadernoTemplateRepository — as consultas', () => {
  it('publicada() busca por status', async () => {
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue(comExec({ versao: 3 })),
    });

    await repo.publicada();

    expect(model.findOne).toHaveBeenCalledWith({ status: 'publicada' });
  });

  it('rascunho() busca por status rascunho', async () => {
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue(comExec(null)),
    });

    expect(await repo.rascunho()).toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ status: 'rascunho' });
  });

  it('versoes() ordena DECRESCENTE', async () => {
    // ⚠️ Ascendente é a ordem natural do índice e passaria despercebido numa
    // lista de duas linhas. A tela mostra a mais nova em cima.
    const sort = jest.fn().mockReturnValue(comExec([]));
    const { repo } = repoCom({ find: jest.fn().mockReturnValue({ sort }) });

    await repo.versoes();

    expect(sort).toHaveBeenCalledWith({ versao: -1 });
  });

  it('maiorVersao() devolve 0 quando a coleção está vazia', async () => {
    // ⚠️ `0`, e não `null`: quem chama faz `max + 1`. `null + 1` é 1 por
    // acidente do JS; devolver 0 faz a primeira versão ser 1 por decisão.
    const sort = jest.fn().mockReturnValue(comExec(null));
    const { repo } = repoCom({ findOne: jest.fn().mockReturnValue({ sort }) });

    expect(await repo.maiorVersao()).toBe(0);
  });

  it('porVersao() busca pelo numero, e devolve null quando não existe', async () => {
    // ⚠️ Existe para o restaurar. A alternativa — carregar `versoes()` e
    // procurar no array — funciona hoje com dezenas de versões e vira uma
    // varredura da coleção inteira sem que nada avise.
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue(comExec(null)),
    });

    expect(await repo.porVersao(2)).toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ versao: 2 });
  });

  it('maiorVersao() considera TODOS os status', async () => {
    // ⚠️ Filtrar por 'publicada' aqui reaproveitaria o número de uma versão
    // arquivada e explodiria no índice único de `versao` — em produção, no
    // meio de um publicar.
    const sort = jest.fn().mockReturnValue(comExec({ versao: 9 }));
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue({ sort }),
    });

    expect(await repo.maiorVersao()).toBe(9);
    expect(model.findOne).toHaveBeenCalledWith({});
  });
});

describe('CadernoTemplateRepository — a imutabilidade da publicada', () => {
  // ⚠️ O card exige "não há caminho de escrita que altere uma publicada".
  // Isso não é um teste: é uma propriedade de TODOS os métodos de escrita, e
  // o jeito de garanti-la é o filtro carregar o status esperado.

  it('arquivarPublicada só atinge quem está publicada', async () => {
    const { model, repo } = repoCom({
      updateOne: jest.fn().mockReturnValue(comExec({ modifiedCount: 1 })),
    });

    await repo.arquivarPublicada();

    const [filtro] = model.updateOne.mock.calls[0];
    expect(filtro).toEqual({ status: 'publicada' });
  });

  it('promoverRascunho só atinge quem está rascunho', async () => {
    const { model, repo } = repoCom({
      updateOne: jest.fn().mockReturnValue(comExec({ modifiedCount: 1 })),
    });

    await repo.promoverRascunho(7);

    const [filtro, update] = model.updateOne.mock.calls[0];
    expect(filtro).toEqual({ status: 'rascunho' });
    expect(update.$set.versao).toBe(7);
    expect(update.$set.status).toBe('publicada');
    expect(update.$set.publicadaEm).toBeInstanceOf(Date);
  });

  it('descartarRascunho só apaga rascunho', async () => {
    const { model, repo } = repoCom({
      deleteOne: jest.fn().mockReturnValue(comExec({ deletedCount: 1 })),
    });

    await repo.descartarRascunho();

    expect(model.deleteOne.mock.calls[0][0]).toEqual({ status: 'rascunho' });
  });

  it('CATRACA: nenhum método de escrita novo entra sem prova', () => {
    // ⚠️ Não é asserção de comportamento, é catraca: quebra quando alguém
    // adiciona um caminho de escrita, obrigando a decidir conscientemente se
    // ele pode tocar uma `publicada`. Que é o modo de falha do card.
    const escritas = Object.getOwnPropertyNames(
      CadernoTemplateRepository.prototype,
    ).filter((m) =>
      /^(arquivar|promover|descartar|substituir|criar|atualizar|remover)/.test(
        m,
      ),
    );

    expect(escritas.sort()).toEqual([
      'arquivarPublicada',
      'criarRascunho',
      'descartarRascunho',
      'promoverRascunho',
      'substituirRascunho',
    ]);
  });
});
