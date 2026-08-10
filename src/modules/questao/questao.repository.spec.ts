import { QuestaoRepository } from './questao.repository';

describe('QuestaoRepository.canInsertQuestion (reverse-lookup em Prova.questoes)', () => {
  function makeRepo(prova: any) {
    const exec = jest.fn().mockResolvedValue(prova);
    const populate = jest.fn().mockReturnValue({ exec });
    const findById = jest.fn().mockReturnValue({ populate });
    const questaoModel: any = {};
    const provaModel: any = { findById };
    return { repo: new QuestaoRepository(questaoModel, provaModel), findById, populate };
  }

  it('retorna false quando já existe entry com o mesmo numero+frente1', async () => {
    const { repo } = makeRepo({ questoes: [{ numero: 5, questao: { frente1: 'f1' } }] });
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(false);
  });

  it('retorna true quando o numero está livre', async () => {
    const { repo } = makeRepo({ questoes: [{ numero: 6, questao: { frente1: 'f1' } }] });
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(true);
  });

  it('retorna true quando o numero existe mas com outra frente1 (idiomática)', async () => {
    const { repo } = makeRepo({ questoes: [{ numero: 5, questao: { frente1: 'fx' } }] });
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(true);
  });

  it('retorna true quando a prova não existe', async () => {
    const { repo } = makeRepo(null);
    expect(await repo.canInsertQuestion('p1', 5, 'f1')).toBe(true);
  });
});
