import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { SimuladoService } from './simulado.service';

function makeService(simuladoRepo: Record<string, jest.Mock>) {
  const service = new SimuladoService(
    simuladoRepo as any, // simuladoRepository
    {} as any, // questoesRepository
    {} as any, // categoriaRepository
    {} as any, // historicoRepository
    {} as any, // materiaRepository
    {} as any, // queueProducer
  );
  return service;
}

const DE = new Date('2026-01-10T00:00:00.000Z');
const ATE = new Date('2026-01-20T00:00:00.000Z');

describe('SimuladoService.getToAnswer (gate de disponibilidade)', () => {
  it('retorna null quando o simulado não existe', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue(null),
    });
    await expect(service.getToAnswer('x')).resolves.toBeNull();
  });

  it('lança 403 com status "bloqueado" quando bloqueado', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({ bloqueado: true }),
    });
    await expect(service.getToAnswer('x')).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await service.getToAnswer('x');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((e as HttpException).getResponse()).toMatchObject({
        status: 'bloqueado',
      });
    }
  });

  it('lança 403 com status "antes_da_janela" quando antes da janela', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: new Date(Date.now() + 60 * 60 * 1000),
        disponivelAte: null,
      }),
    });
    try {
      await service.getToAnswer('x');
      fail('deveria ter lançado');
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({
        status: 'antes_da_janela',
      });
    }
  });

  it('lança 403 com status "depois_da_janela" quando depois da janela', async () => {
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: null,
        disponivelAte: new Date(Date.now() - 60 * 60 * 1000),
      }),
    });
    try {
      await service.getToAnswer('x');
      fail('deveria ter lançado');
    } catch (e) {
      expect((e as HttpException).getResponse()).toMatchObject({
        status: 'depois_da_janela',
      });
    }
  });

  it('retorna o simulado montado quando disponível (null/null)', async () => {
    const simulado = {
      _id: 's1',
      nome: 'S',
      descricao: 'd',
      bloqueado: false,
      disponivelDe: null,
      disponivelAte: null,
      categoria: { _id: 'c1', duracao: 60 },
      questoes: [],
    } as any;
    const service = makeService({
      getAvailabilityById: jest.fn().mockResolvedValue({
        bloqueado: false,
        disponivelDe: null,
        disponivelAte: null,
      }),
      getById: jest.fn().mockResolvedValue(simulado),
    });
    const result = await service.getToAnswer('s1');
    expect(result).toMatchObject({ _id: 's1', nome: 'S', duracao: 60 });
  });
});

describe('SimuladoService.updateDisponibilidade', () => {
  it('lança NotFound quando o simulado não existe', async () => {
    const service = makeService({
      getById: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.updateDisponibilidade('x', { disponivelDe: DE }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lança 400 quando disponivelDe >= disponivelAte (ambos no dto)', async () => {
    const service = makeService({
      getById: jest.fn().mockResolvedValue({ _id: 'x' }),
      updateDisponibilidade: jest.fn(),
    });
    await expect(
      service.updateDisponibilidade('x', {
        disponivelDe: ATE,
        disponivelAte: DE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança 400 ao patchar só disponivelDe se o disponivelAte existente ficar invertido', async () => {
    const service = makeService({
      getById: jest.fn().mockResolvedValue({ _id: 'x', disponivelAte: DE }),
      updateDisponibilidade: jest.fn(),
    });
    await expect(
      service.updateDisponibilidade('x', { disponivelDe: ATE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persiste só o campo enviado (omitido = inalterado)', async () => {
    const updateDisponibilidade = jest.fn().mockResolvedValue(undefined);
    const getById = jest
      .fn()
      .mockResolvedValue({ _id: 'x', disponivelDe: null, disponivelAte: null });
    const service = makeService({ getById, updateDisponibilidade });

    await service.updateDisponibilidade('x', { disponivelAte: ATE });

    expect(updateDisponibilidade).toHaveBeenCalledWith('x', {
      disponivelAte: ATE,
    });
  });

  it('propaga null explícito para limpar', async () => {
    const updateDisponibilidade = jest.fn().mockResolvedValue(undefined);
    const getById = jest
      .fn()
      .mockResolvedValue({ _id: 'x', disponivelDe: DE, disponivelAte: ATE });
    const service = makeService({ getById, updateDisponibilidade });

    await service.updateDisponibilidade('x', { disponivelDe: null });

    expect(updateDisponibilidade).toHaveBeenCalledWith('x', {
      disponivelDe: null,
    });
  });
});
