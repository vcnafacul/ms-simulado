import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';

describe('RelatorioSimuladoEstudanteRepository.criar', () => {
  it('grava o vínculo convertendo as refs em ObjectId', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'r1' });
    const repo = new RelatorioSimuladoEstudanteRepository({ create } as any);

    await repo.criar({
      historicoId: '665f0c1a2b3c4d5e6f00abc1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc2',
      usuario: 'u1',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    const arg = create.mock.calls[0][0];
    expect(arg.historico.toString()).toBe('665f0c1a2b3c4d5e6f00abc1');
    expect(arg.simulado.toString()).toBe('665f0c1a2b3c4d5e6f00abc2');
    expect(arg.usuario).toBe('u1');
    expect(arg.cursinhoId).toBe('cur-1');
    expect(arg.turmaId).toBe('t-1');
  });

  it('aceita estudante sem turma', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'r1' });
    const repo = new RelatorioSimuladoEstudanteRepository({ create } as any);

    await repo.criar({
      historicoId: '665f0c1a2b3c4d5e6f00abc1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc2',
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    expect(create.mock.calls[0][0].turmaId).toBeUndefined();
  });
});
