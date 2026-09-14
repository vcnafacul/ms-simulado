import { ProvaRepository } from './prova.repository';

/**
 * ⚠️ Duas coisas que o filtro precisa fazer, e que falham em silêncio se
 * sumirem: excluir os soft-deleted, e tratar `undefined` como `null`.
 */
describe('ProvaRepository.getAtivaByNomeECursinho', () => {
  function montar() {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = new ProvaRepository({ findOne } as never);
    return { repo, findOne };
  }

  it('filtra por nome, cursinho e descarta os excluídos', async () => {
    const { repo, findOne } = montar();

    await repo.getAtivaByNomeECursinho('Minha Prova', 'cur-1');

    expect(findOne).toHaveBeenCalledWith({
      nome: 'Minha Prova',
      cursinhoId: 'cur-1',
      // ⚠️ Sem isto, excluir uma prova e recriar com o mesmo nome devolve 409
      // apontando para um registro que ninguém mais enxerga.
      deleted: { $ne: true },
    });
  });

  it('cursinho ausente vira null, não undefined', async () => {
    /**
     * ⚠️ `{ cursinhoId: undefined }` é ignorado pelo Mongo — o filtro sumiria e
     * a busca voltaria a ser global, exatamente o defeito que este trabalho
     * conserta. `null` casa com o campo nulo E com o campo ausente, que é o
     * estado das provas legadas.
     */
    const { repo, findOne } = montar();

    await repo.getAtivaByNomeECursinho('Minha Prova', undefined as never);

    expect(findOne.mock.calls[0][0].cursinhoId).toBeNull();
  });
});
