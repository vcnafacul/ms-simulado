import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriaService } from './categoria.service';
import { DONO_SYSTEM } from './schemas/categoria.schema';

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
    getAtivaByNomeEDono?: jest.Mock;
    create?: jest.Mock;
  }) {
    const repository = {
      getAtivaByNomeEDono:
        over?.getAtivaByNomeEDono ?? jest.fn().mockResolvedValue(null),
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
    expect(repository.getAtivaByNomeEDono).toHaveBeenCalledWith(
      'Personalizado 30q 60min',
      DONO_SYSTEM,
    );
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
      getAtivaByNomeEDono: jest.fn().mockResolvedValue({ _id: 'seed-enem' }),
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

describe('CategoriaService.getAll (anexa contagem de uso)', () => {
  it('anexa simuladosCount e provasCount a cada categoria retornada', async () => {
    const repository = {
      getAll: jest.fn().mockResolvedValue({
        data: [
          { _id: 'cat-1', nome: 'A' },
          { _id: 'cat-2', nome: 'B' },
        ],
        page: 1,
        limit: 10,
        totalItems: 2,
      }),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-1': 3 }),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-2': 5 }),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getAll({ page: 1, limit: 10 });

    expect(result.data).toEqual([
      { _id: 'cat-1', nome: 'A', simuladosCount: 3, provasCount: 0 },
      { _id: 'cat-2', nome: 'B', simuladosCount: 0, provasCount: 5 },
    ]);
    expect(simuladoRepository.countsByCategoria).toHaveBeenCalledWith([
      'cat-1',
      'cat-2',
    ]);
    expect(provaRepository.countsByCategoria).toHaveBeenCalledWith([
      'cat-1',
      'cat-2',
    ]);
  });

  it('converte documento Mongoose (com toObject) antes de anexar as contagens', async () => {
    const doc = {
      _id: 'cat-1',
      toObject: jest.fn().mockReturnValue({ _id: 'cat-1', nome: 'A' }),
    };
    const repository = {
      getAll: jest.fn().mockResolvedValue({
        data: [doc],
        page: 1,
        limit: 10,
        totalItems: 1,
      }),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({}),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({}),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getAll({ page: 1, limit: 10 });

    expect(doc.toObject).toHaveBeenCalled();
    expect(result.data).toEqual([
      { _id: 'cat-1', nome: 'A', simuladosCount: 0, provasCount: 0 },
    ]);
  });
});

describe('CategoriaService.getAll (escopo por dono)', () => {
  /**
   * ⚠️ Estes testes existem porque uma mutação sobreviveu: trocar o
   * `{ ...param, where: { dono } }` por `param` cru deixava TODA a suíte verde.
   * O controller provava só o repasse do argumento; ninguém provava que o
   * argumento vira filtro — e sem filtro a listagem de um cursinho devolve as
   * categorias de todos os outros.
   */
  function makeGetAllService() {
    const repository = {
      getAll: jest.fn().mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        totalItems: 0,
      }),
    };
    const countsByCategoria = jest.fn().mockResolvedValue({});
    const service = new CategoriaService(
      repository as any,
      { countByCategoria: jest.fn(), countsByCategoria } as any,
      { countByCategoria: jest.fn(), countsByCategoria } as any,
    );
    return { service, repository };
  }

  it('sem dono, filtra pelas categorias do sistema', async () => {
    const { service, repository } = makeGetAllService();

    await service.getAll({ page: 1, limit: 10 });

    expect(repository.getAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      where: { dono: DONO_SYSTEM },
    });
  });

  it('com dono, filtra por aquele dono', async () => {
    const { service, repository } = makeGetAllService();

    await service.getAll({ page: 1, limit: 10 }, 'cur-1');

    expect(repository.getAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      where: { dono: 'cur-1' },
    });
  });
});

describe('CategoriaService.getById (anexa contagem de uso)', () => {
  it('retorna a categoria com simuladosCount/provasCount', async () => {
    const repository = {
      getById: jest.fn().mockResolvedValue({ _id: 'cat-1', nome: 'A' }),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-1': 4 }),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-1': 2 }),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getById('cat-1');

    expect(result).toEqual({
      _id: 'cat-1',
      nome: 'A',
      simuladosCount: 4,
      provasCount: 2,
    });
  });

  it('retorna null quando a categoria não existe', async () => {
    const repository = { getById: jest.fn().mockResolvedValue(null) };
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

    const result = await service.getById('cat-x');

    expect(result).toBeNull();
    expect(simuladoRepository.countsByCategoria).not.toHaveBeenCalled();
  });
});

describe('CategoriaService — dono', () => {
  let service: CategoriaService;
  let repository: {
    getAtivaByNomeEDono: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
    delete: jest.Mock;
    getAll: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      getAtivaByNomeEDono: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (c) => c),
      getById: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn(),
    };
    service = new CategoriaService(
      repository as never,
      { countByCategoria: jest.fn().mockResolvedValue(0) } as never,
      { countByCategoria: jest.fn().mockResolvedValue(0) } as never,
    );
  });

  const dto = { duracao: 60, quantidadeTotalQuestao: 30, exame: 'e1' } as never;

  it('grava o dono recebido, e não o que veio no corpo', async () => {
    /**
     * ⚠️ A garantia de isolamento. Se o `dono` puder vir do DTO, o cursinho A
     * cria categoria em nome do B mandando um campo a mais no JSON.
     */
    const criada = await service.add(
      { ...(dto as object), dono: 'HACK' } as never,
      'cur-1',
    );
    expect(criada.dono).toBe('cur-1');
  });

  it('sem dono informado, é do sistema', async () => {
    const criada = await service.add({
      ...(dto as object),
      nome: 'X 30q 60min',
    } as never);
    expect(criada.dono).toBe(DONO_SYSTEM);
  });

  it('a colisão é por dono+nome, não só por nome', async () => {
    await service.add(
      { ...(dto as object), nome: 'Enem Dia 1' } as never,
      'cur-1',
    );
    expect(repository.getAtivaByNomeEDono).toHaveBeenCalledWith(
      'Enem Dia 1',
      'cur-1',
    );
  });

  it('mesmo nome e mesmo dono dá 409', async () => {
    repository.getAtivaByNomeEDono.mockResolvedValue({ _id: 'ja-existe' });
    await expect(
      service.add({ ...(dto as object), nome: 'Enem Dia 1' } as never, 'cur-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('o pattern do nome vale para o sistema', async () => {
    await expect(
      service.add({ ...(dto as object), nome: 'Enem Dia 1' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('o pattern NÃO vale para categoria de cursinho', async () => {
    // ⚠️ É o que torna possível o exemplo do ticket: o cursinho A criando a
    // própria "Enem Dia 1", que bate 400 no pattern do admin.
    const criada = await service.add(
      { ...(dto as object), nome: 'Enem Dia 1' } as never,
      'cur-1',
    );
    expect(criada.nome).toBe('Enem Dia 1');
  });

  it('categoria de cursinho continua custom — é o que garante 1 simulado', async () => {
    const criada = await service.add(
      { ...(dto as object), nome: 'Enem Dia 1' } as never,
      'cur-1',
    );
    expect(criada.custom).toBe(true);
  });
});
