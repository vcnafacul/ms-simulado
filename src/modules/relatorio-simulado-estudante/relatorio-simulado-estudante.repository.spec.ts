import { Types } from 'mongoose';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';

const HIST_1 = '665f0c1a2b3c4d5e6f00abc1';
const HIST_2 = '665f0c1a2b3c4d5e6f00abc9';
const SIM = '665f0c1a2b3c4d5e6f00abc2';

const montar = () => {
  const updateOne = jest.fn().mockResolvedValue({ upsertedCount: 1 });
  const repo = new RelatorioSimuladoEstudanteRepository({ updateOne } as any);
  return { repo, updateOne };
};

describe('RelatorioSimuladoEstudanteRepository.registrar', () => {
  it('grava o vínculo com refs de verdade, não strings', async () => {
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    const [filtro, update, opcoes] = updateOne.mock.calls[0];
    // uma string aqui passaria por um toString() — exigimos o tipo
    expect(update.$set.historico).toBeInstanceOf(Types.ObjectId);
    expect(update.$set.historico.toString()).toBe(HIST_1);
    expect(filtro.simulado).toBeInstanceOf(Types.ObjectId);
    expect(filtro.simulado.toString()).toBe(SIM);
    expect(filtro.cursinhoId).toBe('cur-1');
    expect(filtro.usuario).toBe('u1');
    expect(update.$set.turmaId).toBe('t-1');
    expect(opcoes).toEqual({ upsert: true });
  });

  it('a chave do upsert é o estudante, não o histórico', async () => {
    // senão o reenvio depois de uma falha criaria uma segunda linha
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    expect(Object.keys(updateOne.mock.calls[0][0]).sort()).toEqual([
      'cursinhoId',
      'simulado',
      'usuario',
    ]);
  });

  it('reenvio aponta a MESMA linha para o histórico novo', async () => {
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });
    await repo.registrar({
      historicoId: HIST_2,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    const [f1] = updateOne.mock.calls[0];
    const [f2, u2] = updateOne.mock.calls[1];
    expect(JSON.stringify(f1)).toBe(JSON.stringify(f2)); // mesmo alvo
    expect(u2.$set.historico.toString()).toBe(HIST_2); // tentativa atual
  });

  it('aceita estudante sem turma', async () => {
    const { repo, updateOne } = montar();

    await repo.registrar({
      historicoId: HIST_1,
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    expect(updateOne.mock.calls[0][1].$set.turmaId).toBeUndefined();
  });
});
