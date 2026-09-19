import { BadRequestException } from '@nestjs/common';
import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';

const SIM = '665f0c1a2b3c4d5e6f00abc2';

const montar = () => {
  const service = {
    consultar: jest
      .fn()
      .mockResolvedValue({ linhas: [], totalEstudantesComCartaoNoCursinho: 0 }),
  };
  return {
    ctrl: new RelatorioSimuladoEstudanteController(service as any),
    service,
  };
};

describe('RelatorioSimuladoEstudanteController', () => {
  it('repassa simulado, cursinho e turma ao serviço', async () => {
    const { ctrl, service } = montar();

    await ctrl.consultar(SIM, { cursinhoId: 'cur-1', turmaId: 't-1' } as any);

    expect(service.consultar).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('sem turma, não inventa uma', async () => {
    const { ctrl, service } = montar();

    await ctrl.consultar(SIM, { cursinhoId: 'cur-1' } as any);

    expect(service.consultar).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: undefined,
    });
  });
});

describe('RelatorioSimuladoEstudanteController.consultarQuestoes', () => {
  const montarQ = () => {
    const service = {
      consultarQuestoes: jest.fn().mockResolvedValue({ questoes: [] }),
    };
    return {
      ctrl: new RelatorioSimuladoEstudanteController(service as any),
      service,
    };
  };

  it('repassa simulado, cursinho e turma', async () => {
    const { ctrl, service } = montarQ();

    await ctrl.consultarQuestoes(SIM, {
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    } as any);

    expect(service.consultarQuestoes).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('recusa :simuladoId que não é ObjectId — 400, não 500', async () => {
    const { ctrl, service } = montarQ();

    await expect(
      ctrl.consultarQuestoes('nao-e-objectid', { cursinhoId: 'cur-1' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(service.consultarQuestoes).not.toHaveBeenCalled();
  });
});
