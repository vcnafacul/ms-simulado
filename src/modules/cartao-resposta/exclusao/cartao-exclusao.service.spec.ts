import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import {
  CartaoExclusaoService,
  TEXTO_LEITURA_EM_ANDAMENTO,
} from './cartao-exclusao.service';

const SIMULADO = new Types.ObjectId();
const RESPOSTAS = [
  { questao: new Types.ObjectId(), alternativaEstudante: 'A' },
];

const historicoDe = (over: Record<string, unknown> = {}) => ({
  _id: 'h1',
  usuario: 'u-errado',
  simulado: SIMULADO,
  status: HistoricoStatus.Completed,
  imageKey: 'cartoes/s1/foto.jpg',
  respostas: RESPOSTAS,
  ...over,
});

const montar = (
  over: { linha?: unknown; atual?: unknown; excluido?: unknown } = {},
) => {
  const historicoRepository = {
    getByFilter: jest
      .fn()
      .mockResolvedValue(over.atual === undefined ? historicoDe() : over.atual),
    excluirDefinitivo: jest
      .fn()
      .mockResolvedValue(
        over.excluido === undefined ? historicoDe() : over.excluido,
      ),
  };
  const relatorioRepository = {
    buscarPorHistorico: jest
      .fn()
      .mockResolvedValue(
        over.linha === undefined
          ? { usuario: 'u-errado', simulado: SIMULADO }
          : over.linha,
      ),
    excluirPorHistorico: jest.fn().mockResolvedValue(undefined),
  };
  const questaoRepository = {
    updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
  };
  const cartaoExcluidoRepository = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new CartaoExclusaoService(
    historicoRepository as any,
    relatorioRepository as any,
    questaoRepository as any,
    cartaoExcluidoRepository as any,
  );
  return {
    svc,
    historicoRepository,
    relatorioRepository,
    questaoRepository,
    cartaoExcluidoRepository,
  };
};

const PARAMS = {
  historicoId: 'h1',
  cursinhoId: 'cur-1',
  excluidoPor: 'user-9',
};

describe('CartaoExclusaoService (card 36)', () => {
  it('apaga o histórico, desconta as questões, tira do relatório e audita', async () => {
    const m = montar();

    await expect(m.svc.excluir(PARAMS)).resolves.toEqual({
      imageKey: 'cartoes/s1/foto.jpg',
      usuario: 'u-errado',
      simuladoId: SIMULADO.toString(),
    });

    expect(m.historicoRepository.excluirDefinitivo).toHaveBeenCalledWith('h1', [
      HistoricoStatus.Completed,
      HistoricoStatus.Failed,
    ]);
    // Desconto puro: nada novo, as respostas gravadas saem.
    expect(m.questaoRepository.updateQuestionAnswered).toHaveBeenCalledWith(
      [],
      RESPOSTAS,
    );
    expect(m.relatorioRepository.excluirPorHistorico).toHaveBeenCalledWith(
      'h1',
    );
    expect(m.cartaoExcluidoRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        historicoId: 'h1',
        usuario: 'u-errado',
        simuladoId: SIMULADO.toString(),
        cursinhoId: 'cur-1',
        excluidoPor: 'user-9',
        status: HistoricoStatus.Completed,
        imageKey: 'cartoes/s1/foto.jpg',
        historico: expect.objectContaining({ _id: 'h1' }),
      }),
    );
  });

  it('⚠️ histórico de OUTRO cursinho: 404, e nada é lido nem apagado', async () => {
    const m = montar({ linha: null });

    await expect(m.svc.excluir(PARAMS)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(m.historicoRepository.getByFilter).not.toHaveBeenCalled();
    expect(m.historicoRepository.excluirDefinitivo).not.toHaveBeenCalled();
    expect(m.relatorioRepository.excluirPorHistorico).not.toHaveBeenCalled();
  });

  it.each([
    HistoricoStatus.AwaitingOmr,
    HistoricoStatus.Pending,
    HistoricoStatus.Processing,
  ])('⚠️ leitura em andamento (%s): 409 e nada muda', async (status) => {
    const m = montar({ atual: historicoDe({ status }) });

    await expect(m.svc.excluir(PARAMS)).rejects.toThrow(
      new ConflictException(TEXTO_LEITURA_EM_ANDAMENTO),
    );
    expect(m.historicoRepository.excluirDefinitivo).not.toHaveBeenCalled();
    expect(m.questaoRepository.updateQuestionAnswered).not.toHaveBeenCalled();
    expect(m.relatorioRepository.excluirPorHistorico).not.toHaveBeenCalled();
  });

  it('⚠️ status mudou entre a leitura e a exclusão: 409, sem descontar', async () => {
    const m = montar({ excluido: null });

    await expect(m.svc.excluir(PARAMS)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(m.questaoRepository.updateQuestionAnswered).not.toHaveBeenCalled();
    expect(m.cartaoExcluidoRepository.registrar).not.toHaveBeenCalled();
    expect(m.relatorioRepository.excluirPorHistorico).not.toHaveBeenCalled();
  });

  it('falha de leitura SEM respostas: exclui sem mexer nas questões', async () => {
    const falho = historicoDe({
      status: HistoricoStatus.Failed,
      respostas: undefined,
    });
    const m = montar({ atual: falho, excluido: falho });

    await m.svc.excluir(PARAMS);

    expect(m.questaoRepository.updateQuestionAnswered).not.toHaveBeenCalled();
    expect(m.relatorioRepository.excluirPorHistorico).toHaveBeenCalledWith(
      'h1',
    );
  });

  it('⚠️ falha num REPROCESSAMENTO ainda tem as respostas antigas: desconta', async () => {
    const falho = historicoDe({ status: HistoricoStatus.Failed });
    const m = montar({ atual: falho, excluido: falho });

    await m.svc.excluir(PARAMS);

    expect(m.questaoRepository.updateQuestionAnswered).toHaveBeenCalledWith(
      [],
      RESPOSTAS,
    );
  });

  it('⚠️ exclusão anterior parou no meio (histórico já saiu): termina a limpeza', async () => {
    const m = montar({ atual: null });

    await expect(m.svc.excluir(PARAMS)).resolves.toEqual({
      imageKey: null,
      usuario: 'u-errado',
      simuladoId: SIMULADO.toString(),
    });
    expect(m.historicoRepository.excluirDefinitivo).not.toHaveBeenCalled();
    expect(m.cartaoExcluidoRepository.registrar).not.toHaveBeenCalled();
    expect(m.relatorioRepository.excluirPorHistorico).toHaveBeenCalledWith(
      'h1',
    );
  });
});
