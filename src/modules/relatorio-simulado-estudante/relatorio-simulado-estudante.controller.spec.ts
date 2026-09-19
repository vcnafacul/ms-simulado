import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';

const SIM = '665f0c1a2b3c4d5e6f00abc2';

const montar = () => {
  const service = {
    consultar: jest
      .fn()
      .mockResolvedValue({ linhas: [], totalCartoesDoCursinhoNoSimulado: 0 }),
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
