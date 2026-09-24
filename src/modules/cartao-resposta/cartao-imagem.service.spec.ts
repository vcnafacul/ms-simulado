import { NotFoundException } from '@nestjs/common';
import { CartaoImagemService } from './cartao-imagem.service';

const montar = (over: { linha?: unknown; historico?: unknown } = {}) => {
  const historicoRepository = {
    getByFilter: jest
      .fn()
      .mockResolvedValue(
        over.historico === undefined
          ? { _id: 'h1', imageKey: 'cartoes/s1/foto.jpg' }
          : over.historico,
      ),
  };
  const relatorioRepository = {
    buscarPorHistorico: jest
      .fn()
      .mockResolvedValue(
        over.linha === undefined ? { usuario: 'u1' } : over.linha,
      ),
  };
  const svc = new CartaoImagemService(
    historicoRepository as any,
    relatorioRepository as any,
  );
  return { svc, historicoRepository, relatorioRepository };
};

describe('CartaoImagemService', () => {
  it('devolve a imageKey do histórico do cursinho', async () => {
    const { svc, relatorioRepository } = montar();

    await expect(svc.localizar('h1', 'cur-1')).resolves.toEqual({
      imageKey: 'cartoes/s1/foto.jpg',
    });
    expect(relatorioRepository.buscarPorHistorico).toHaveBeenCalledWith(
      'h1',
      'cur-1',
    );
  });

  it('⚠️ histórico de OUTRO cursinho: 404, e nem chega a ler o histórico', async () => {
    const { svc, historicoRepository } = montar({ linha: null });

    await expect(svc.localizar('h1', 'cur-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(historicoRepository.getByFilter).not.toHaveBeenCalled();
  });

  it('histórico sem foto (feito pela tela): 404', async () => {
    const { svc } = montar({ historico: { _id: 'h1' } });

    await expect(svc.localizar('h1', 'cur-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
