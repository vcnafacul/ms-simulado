import { BadGatewayException, ConflictException } from '@nestjs/common';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { CartaoHistoricoService } from './cartao-historico.service';

function setup(over: any = {}) {
  const repo = {
    existsCartaoAtivo: jest.fn().mockResolvedValue(false),
    createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    ...over.repo,
  };
  const omr = {
    enviarProcessamento: jest.fn().mockResolvedValue(undefined),
    ...over.omr,
  };
  return {
    svc: new CartaoHistoricoService(repo as any, omr as any),
    repo,
    omr,
  };
}
const DTO = {
  usuario: 'u1',
  imageKey: 'cartoes/665abc/i.jpg',
  cartaoCode: '7',
};

it('happy: cria e chama o omr', async () => {
  const { svc, repo, omr } = setup();
  const r = await svc.criar(DTO);
  expect(r).toEqual({ historicoId: 'h1' });
  expect(repo.createAwaitingOmr).toHaveBeenCalledWith(
    expect.objectContaining({ simuladoId: '665abc' }),
  );
  expect(omr.enviarProcessamento).toHaveBeenCalledWith(DTO.imageKey);
});

it('dedup: 409 e não cria', async () => {
  const { svc, repo } = setup({
    repo: { existsCartaoAtivo: jest.fn().mockResolvedValue(true) },
  });
  await expect(svc.criar(DTO)).rejects.toBeInstanceOf(ConflictException);
  expect(repo.createAwaitingOmr).not.toHaveBeenCalled();
});

it('omr falha: marca Failed e 502', async () => {
  const { svc, repo } = setup({
    omr: {
      enviarProcessamento: jest.fn().mockRejectedValue(new Error('down')),
    },
  });
  await expect(svc.criar(DTO)).rejects.toBeInstanceOf(BadGatewayException);
  expect(repo.updateStatus).toHaveBeenCalledWith('h1', HistoricoStatus.Failed);
});

it('imageKey inválido: 400 sem criar', async () => {
  const { svc, repo } = setup();
  await expect(svc.criar({ ...DTO, imageKey: 'invalido' })).rejects.toThrow();
  expect(repo.createAwaitingOmr).not.toHaveBeenCalled();
});
