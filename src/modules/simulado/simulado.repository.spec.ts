import { SimuladoRepository } from './simulado.repository';

describe('SimuladoRepository.countByCategoria', () => {
  it('conta simulados não-deletados que referenciam a categoria', async () => {
    const countDocuments = jest.fn().mockResolvedValue(3);
    const repo = new SimuladoRepository({ countDocuments } as any);

    const total = await repo.countByCategoria('cat-123');

    expect(total).toBe(3);
    expect(countDocuments).toHaveBeenCalledWith({
      categoria: 'cat-123',
      deleted: { $ne: true },
    });
  });
});
