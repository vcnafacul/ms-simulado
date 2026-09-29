import { HttpException } from '@nestjs/common';
import { Status } from './enums/status.enum';
import { QuestaoService } from './questao.service';

/** tickets/025, card 02 — +1 para o cursinho de quem aprova. */
function montar(statusAtual = Status.Pending) {
  const repository = {
    getByIdToUpdate: jest
      .fn()
      .mockResolvedValue({ _id: 'q1', status: statusAtual }),
    findProvasContendo: jest.fn().mockResolvedValue([]),
    UpdateStatus: jest.fn(),
  };
  const contador = {
    incrementarAprovadas: jest.fn().mockResolvedValue(undefined),
    aprovadas: jest.fn().mockResolvedValue(7),
  };
  const service = new QuestaoService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { create: jest.fn() } as never,
    {} as never,
    {} as never,
    contador as never,
  );
  return { service, repository, contador };
}

const ator = (cursinhoId: string | null, extra = {}) => ({
  userId: 'u',
  cursinhoId,
  admin: false,
  editorCursinho: false,
  validadorCursinho: true,
  ...extra,
});

describe('contador de aprovadas por cursinho (025 · 02)', () => {
  it('aprovar com ator do cursinho A → +1 para o A', async () => {
    const { service, contador } = montar();
    await service.updateStatus(
      'q1',
      Status.Approved,
      'u',
      undefined,
      ator('A'),
    );
    expect(contador.incrementarAprovadas).toHaveBeenCalledWith('A');
  });

  it('conta também quando aprova pela permissão do projeto, se é colaborador', async () => {
    const { service, contador } = montar();
    await service.updateStatus(
      'q1',
      Status.Approved,
      'u',
      undefined,
      ator('A', {
        admin: true,
        validadorProjeto: true,
        validadorCursinho: false,
      }),
    );
    expect(contador.incrementarAprovadas).toHaveBeenCalledWith('A');
  });

  it('sem cursinho no ator → não conta', async () => {
    const { service, contador } = montar();
    await service.updateStatus(
      'q1',
      Status.Approved,
      'u',
      undefined,
      ator(null, { admin: true, validadorProjeto: true }),
    );
    expect(contador.incrementarAprovadas).not.toHaveBeenCalled();
  });

  it('recusar não mexe (nem desconta)', async () => {
    const { service, contador } = montar(Status.Approved);
    await service.updateStatus('q1', Status.Rejected, 'u', 'ruim', ator('A'));
    expect(contador.incrementarAprovadas).not.toHaveBeenCalled();
  });

  it('status igual ("não houve alteração") não conta', async () => {
    const { service, contador } = montar(Status.Approved);
    await expect(
      service.updateStatus('q1', Status.Approved, 'u', undefined, ator('A')),
    ).rejects.toBeInstanceOf(HttpException);
    expect(contador.incrementarAprovadas).not.toHaveBeenCalled();
  });

  it('⚠️ falha no contador não desfaz nem derruba a aprovação', async () => {
    const { service, repository, contador } = montar();
    contador.incrementarAprovadas.mockRejectedValue(new Error('mongo fora'));
    await expect(
      service.updateStatus('q1', Status.Approved, 'u', undefined, ator('A')),
    ).resolves.toBeUndefined();
    expect(repository.UpdateStatus).toHaveBeenCalledWith('q1', Status.Approved);
  });

  it('leitura devolve o número do contador', async () => {
    const { service } = montar();
    await expect(service.questoesAprovadasDoCursinho('A')).resolves.toEqual({
      questoesAprovadas: 7,
    });
  });
});
