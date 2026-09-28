import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SinalizarRevisaoDTOInput } from './dtos/sinalizar-revisao.dto.input';
import { QuestaoService } from './questao.service';

/** tickets/024, card 04 — sinalizar para revisão. */
function montar(questao: unknown = { _id: 'q1' }) {
  const repository = {
    getById: jest.fn().mockResolvedValue(questao),
    marcarReportada: jest.fn(),
    getAll: jest.fn().mockResolvedValue({ data: [], totalItems: 0 }),
    findProvasContendoMany: jest.fn().mockResolvedValue(new Map()),
  };
  const auditLogService = { create: jest.fn() };
  const service = new QuestaoService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    auditLogService as never,
    {} as never,
    {} as never,
  );
  return { service, repository, auditLogService };
}
const ator = {
  userId: 'u',
  cursinhoId: 'A',
  admin: false,
  editorCursinho: false,
  validadorCursinho: true,
};

describe('sinalizarRevisao (024 · 04)', () => {
  it('marca reported e deixa motivo, quem e cursinho no histórico', async () => {
    const { service, repository, auditLogService } = montar();
    await service.sinalizarRevisao('q1', 'Gabarito errado na C', ator);
    expect(repository.marcarReportada).toHaveBeenCalledWith('q1');
    const log = auditLogService.create.mock.calls[0][0];
    expect(log.user).toBe('u');
    expect(JSON.parse(log.changes)).toEqual({
      acao: 'sinalizarRevisao',
      motivo: 'Gabarito errado na C',
      cursinhoId: 'A',
    });
  });

  it('sem ator → 403; questão inexistente → 404; nada é escrito', async () => {
    const a = montar();
    await expect(
      a.service.sinalizarRevisao('q1', 'motivo longo', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const b = montar(null);
    await expect(
      b.service.sinalizarRevisao('q1', 'motivo longo', ator),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(a.repository.marcarReportada).not.toHaveBeenCalled();
    expect(b.repository.marcarReportada).not.toHaveBeenCalled();
  });

  it.each([
    ['curto', 'curto', false],
    ['vazio', '', false],
    ['500+', 'x'.repeat(501), false],
    ['ok', 'Enunciado ambíguo', true],
  ])('motivo %s → válido? %s', (_n, motivo, valido) => {
    const erros = validateSync(
      plainToInstance(SinalizarRevisaoDTOInput, { motivo }),
    );
    expect(erros.length === 0).toBe(valido);
  });

  it('filtro: reported=true lista só as sinalizadas', async () => {
    const { service, repository } = montar();
    await service.getAll({ page: 1, limit: 10, reported: 'true' } as never);
    expect(repository.getAll.mock.calls[0][0].where).toMatchObject({
      reported: true,
    });
  });
});
