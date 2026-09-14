import { CategoriaController } from './categoria.controller';
import { DONO_SYSTEM } from './schemas/categoria.schema';

describe('CategoriaController — dono', () => {
  const service = {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    add: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn(),
  };
  const controller = new CategoriaController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('sem dono na query, lista as do sistema', async () => {
    await controller.getAll({ page: 1, limit: 40 } as never, undefined);
    expect(service.getAll).toHaveBeenCalledWith(
      { page: 1, limit: 40 },
      DONO_SYSTEM,
    );
  });

  it('com dono na query, repassa o dono', async () => {
    await controller.getAll({ page: 1, limit: 40 } as never, 'cur-1');
    expect(service.getAll).toHaveBeenCalledWith(
      { page: 1, limit: 40 },
      'cur-1',
    );
  });

  it('o POST repassa o dono do header, não do corpo', async () => {
    // ⚠️ Header e não body: o corpo é do cliente, o header é escrito pela api.
    await controller.post({ nome: 'X', dono: 'HACK' } as never, 'cur-1');
    expect(service.add).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'X' }),
      'cur-1',
    );
  });
});
