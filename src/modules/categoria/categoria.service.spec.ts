import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriaService } from './categoria.service';

function makeService(overrides?: {
  getById?: jest.Mock;
  deleteFn?: jest.Mock;
  countByCategoria?: jest.Mock;
}) {
  const repository = {
    getById: overrides?.getById ?? jest.fn().mockResolvedValue({ _id: 'cat-1' }),
    delete: overrides?.deleteFn ?? jest.fn().mockResolvedValue(undefined),
  };
  const simuladoRepository = {
    countByCategoria: overrides?.countByCategoria ?? jest.fn().mockResolvedValue(0),
  };
  const service = new CategoriaService(
    repository as any,
    simuladoRepository as any,
  );
  return { service, repository, simuladoRepository };
}

describe('CategoriaService.delete', () => {
  it('deleta quando nenhum simulado usa a categoria', async () => {
    const { service, repository, simuladoRepository } = makeService();

    await service.delete('cat-1');

    expect(simuladoRepository.countByCategoria).toHaveBeenCalledWith('cat-1');
    expect(repository.delete).toHaveBeenCalledWith('cat-1');
  });

  it('lança 409 com o contador quando a categoria está em uso', async () => {
    const { service, repository } = makeService({
      countByCategoria: jest.fn().mockResolvedValue(3),
    });

    await expect(service.delete('cat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('inclui simuladosUsando no payload do 409', async () => {
    const { service } = makeService({
      countByCategoria: jest.fn().mockResolvedValue(2),
    });

    const error = await service.delete('cat-1').catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message: 'Categoria em uso e não pode ser excluída',
      simuladosUsando: 2,
    });
  });

  it('lança 404 quando a categoria não existe', async () => {
    const { service, simuladoRepository } = makeService({
      getById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.delete('cat-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(simuladoRepository.countByCategoria).not.toHaveBeenCalled();
  });
});
