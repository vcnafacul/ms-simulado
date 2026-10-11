import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DONO_CURSINHO,
  DONO_SYSTEM,
} from '../categoria/schemas/categoria.schema';
import { ProvaService } from './prova.service';

/**
 * tickets/023, card 04 (R3): prova de cursinho só em categoria do próprio
 * cursinho — senão nasce protegida e nem ele a compõe (R2).
 */
function montar(categoria: unknown) {
  const factory = {
    createProva: jest.fn().mockResolvedValue({}),
    createSimulados: jest.fn(),
  };
  const repository = {
    create: jest.fn().mockResolvedValue({
      _id: 'p',
      categoria: { nome: 'c', exame: { nome: 'e' } },
      questoes: [],
    }),
  };
  const categoriaRepository = {
    getVivaById: jest.fn().mockResolvedValue(categoria),
  };
  const service = new ProvaService(
    { getFactory: () => factory } as never,
    repository as never,
    categoriaRepository as never,
    {} as never,
    {} as never,
  );
  const escritas = () =>
    factory.createProva.mock.calls.length +
    factory.createSimulados.mock.calls.length +
    repository.create.mock.calls.length;
  return { service, escritas };
}

const dto = (o: object) => ({ categoria: 'cat', ano: 2024, ...o }) as never;

describe('ProvaService.create — categoria da prova de cursinho (023 · 04)', () => {
  it('cursinho A em categoria do A → cria', async () => {
    const { service, escritas } = montar({ dono: 'A' });
    await service.create(dto({ cursinhoId: 'A' }));
    expect(escritas()).toBe(3);
  });

  it.each([
    ['do B', 'B'],
    ['system', DONO_SYSTEM],
  ])('cursinho A em categoria %s → 403 e nada criado', async (_n, dono) => {
    const { service, escritas } = montar({ dono });
    await expect(
      service.create(dto({ cursinhoId: 'A' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(escritas()).toBe(0);
  });

  it('admin (sem cursinho) em categoria system → cria, sem regressão', async () => {
    const { service, escritas } = montar({ dono: DONO_SYSTEM });
    await service.create(dto({ cursinhoId: null }));
    expect(escritas()).toBe(3);
  });

  it('categoria inexistente ou excluída → 404 e nada criado', async () => {
    const { service, escritas } = montar(null);
    await expect(service.create(dto({}))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(escritas()).toBe(0);
  });

  describe('compartilhada "Enem Dia 1/2" do cursinho (tickets/038)', () => {
    it('qualquer cursinho cria nela', async () => {
      for (const cursinhoId of ['A', 'B']) {
        const { service, escritas } = montar({ dono: DONO_CURSINHO });
        await service.create(dto({ cursinhoId }));
        expect(escritas()).toBe(3);
      }
    });

    it('⚠️ sem cursinho (admin) → 403: a prova não teria dono para compor', async () => {
      const { service, escritas } = montar({ dono: DONO_CURSINHO });
      await expect(
        service.create(dto({ cursinhoId: null })),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(escritas()).toBe(0);
    });
  });
});
