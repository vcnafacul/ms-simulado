import { CategoriaRepository } from './categoria.repository';

describe('CategoriaRepository.getAll', () => {
  it('exclui soft-deleted (deleted: { $ne: true }) preservando where e populate', async () => {
    const populate = jest.fn().mockResolvedValue([{ nome: 'Enem Dia 1' }]);
    const chainWhere = jest.fn().mockReturnValue({ populate });
    const limit = jest.fn().mockReturnValue({ where: chainWhere });
    const skip = jest.fn().mockReturnValue({ limit });
    const find = jest.fn().mockReturnValue({ skip });

    const countDocuments = jest.fn().mockResolvedValue(1);
    const modelWhere = jest.fn().mockReturnValue({ countDocuments });

    const model = { find, where: modelWhere } as any;
    const repo = new CategoriaRepository(model);

    const result = await repo.getAll({ page: 1, limit: 10, where: { custom: true } } as any);

    expect(chainWhere).toHaveBeenCalledWith({ deleted: { $ne: true }, custom: true });
    expect(modelWhere).toHaveBeenCalledWith({ deleted: { $ne: true }, custom: true });
    expect(populate).toHaveBeenCalledWith('exame');
    expect(result).toEqual({
      data: [{ nome: 'Enem Dia 1' }],
      page: 1,
      limit: 10,
      totalItems: 1,
    });
  });
});
