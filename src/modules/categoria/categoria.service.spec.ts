import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriaService } from './categoria.service';

function makeService(overrides?: {
  getById?: jest.Mock;
  deleteFn?: jest.Mock;
  countByCategoriaSimulado?: jest.Mock;
  countByCategoriaProva?: jest.Mock;
}) {
  const repository = {
    getById:
      overrides?.getById ?? jest.fn().mockResolvedValue({ _id: 'cat-1' }),
    delete: overrides?.deleteFn ?? jest.fn().mockResolvedValue(undefined),
  };
  const simuladoRepository = {
    countByCategoria:
      overrides?.countByCategoriaSimulado ?? jest.fn().mockResolvedValue(0),
    countsByCategoria: jest.fn().mockResolvedValue({}),
  };
  const provaRepository = {
    countByCategoria:
      overrides?.countByCategoriaProva ?? jest.fn().mockResolvedValue(0),
    countsByCategoria: jest.fn().mockResolvedValue({}),
  };
  const service = new CategoriaService(
    repository as any,
    simuladoRepository as any,
    provaRepository as any,
  );
  return { service, repository, simuladoRepository, provaRepository };
}

describe('CategoriaService.delete', () => {
  it('deleta quando nenhum simulado ou prova usa a categoria', async () => {
    const { service, repository, simuladoRepository, provaRepository } =
      makeService();

    await service.delete('cat-1');

    expect(simuladoRepository.countByCategoria).toHaveBeenCalledWith('cat-1');
    expect(provaRepository.countByCategoria).toHaveBeenCalledWith('cat-1');
    expect(repository.delete).toHaveBeenCalledWith('cat-1');
  });

  it('lança 409 quando há simulados vinculados', async () => {
    const { service, repository } = makeService({
      countByCategoriaSimulado: jest.fn().mockResolvedValue(3),
    });

    await expect(service.delete('cat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('lança 409 quando há provas vinculadas, mesmo com zero simulados', async () => {
    const { service, repository } = makeService({
      countByCategoriaProva: jest.fn().mockResolvedValue(5),
    });

    await expect(service.delete('cat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('inclui simuladosUsando e provasUsando no payload do 409', async () => {
    const { service } = makeService({
      countByCategoriaSimulado: jest.fn().mockResolvedValue(2),
      countByCategoriaProva: jest.fn().mockResolvedValue(7),
    });

    const error = await service.delete('cat-1').catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message: 'Categoria em uso e não pode ser excluída',
      simuladosUsando: 2,
      provasUsando: 7,
    });
  });

  it('lança 404 quando a categoria não existe', async () => {
    const { service, simuladoRepository, provaRepository } = makeService({
      getById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.delete('cat-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(simuladoRepository.countByCategoria).not.toHaveBeenCalled();
    expect(provaRepository.countByCategoria).not.toHaveBeenCalled();
  });
});

describe('CategoriaService.add', () => {
  function makeAddService(over?: {
    getByFilter?: jest.Mock;
    create?: jest.Mock;
  }) {
    const repository = {
      getByFilter: over?.getByFilter ?? jest.fn().mockResolvedValue(null),
      create: over?.create ?? jest.fn().mockImplementation(async (c) => c),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn(),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn(),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );
    return { service, repository };
  }

  it('auto-gera nome e força custom/selecionavel', async () => {
    const { service, repository } = makeAddService();
    await service.add({
      exame: 'e1',
      quantidadeTotalQuestao: 30,
      duracao: 60,
    } as any);
    const saved = repository.create.mock.calls[0][0];
    expect(saved.nome).toBe('Personalizado 30q 60min');
    expect(saved.custom).toBe(true);
    expect(saved.selecionavel).toBe(true);
    expect(repository.getByFilter).toHaveBeenCalledWith({
      nome: 'Personalizado 30q 60min',
    });
  });

  it('auto-gera nome com prefixo fornecido', async () => {
    const { service, repository } = makeAddService();
    await service.add({
      exame: 'e1',
      prefixo: 'Mini Sabatina',
      quantidadeTotalQuestao: 20,
      duracao: 45,
    } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe(
      'Mini Sabatina 20q 45min',
    );
  });

  it('normaliza espaços internos do prefixo (nome tem índice unique)', async () => {
    const { service, repository } = makeAddService();
    await service.add({
      exame: 'e1',
      prefixo: 'Mini   Sabatina',
      quantidadeTotalQuestao: 20,
      duracao: 45,
    } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe(
      'Mini Sabatina 20q 45min',
    );
  });

  it('gera "livre" quando quantidadeTotalQuestao é null', async () => {
    const { service, repository } = makeAddService();
    await service.add({
      exame: 'e1',
      quantidadeTotalQuestao: null,
      duracao: 60,
    } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe(
      'Personalizado livre 60min',
    );
  });

  it('usa o nome explícito quando fornecido e válido', async () => {
    const { service, repository } = makeAddService();
    await service.add({
      nome: 'Custom 10q 30min',
      exame: 'e1',
      duracao: 30,
    } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe('Custom 10q 30min');
  });

  it('lança 409 quando o nome já existe (colisão antes do pattern)', async () => {
    const { service } = makeAddService({
      getByFilter: jest.fn().mockResolvedValue({ _id: 'seed-enem' }),
    });
    await expect(
      service.add({ nome: 'Enem Dia 1', exame: 'e1', duracao: 60 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lança 400 quando o nome novo não segue o pattern', async () => {
    const { service } = makeAddService();
    await expect(
      service.add({
        nome: 'Nome mal formatado',
        exame: 'e1',
        duracao: 60,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('força custom:true e selecionavel:true mesmo se o DTO enviar false', async () => {
    const { service, repository } = makeAddService();
    await service.add({
      nome: 'Custom 10q 30min',
      exame: 'e1',
      duracao: 30,
      custom: false,
      selecionavel: false,
    } as any);
    const saved = repository.create.mock.calls[0][0];
    expect(saved.custom).toBe(true);
    expect(saved.selecionavel).toBe(true);
  });
});
