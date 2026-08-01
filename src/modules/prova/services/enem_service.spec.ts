import { EnemService } from './enem_service';

function makeService() {
  const simuladoRepository = {
    create: jest.fn().mockImplementation(async (s) => ({ ...s, _id: 's-new' })),
  };
  const categoriaRepository = {
    getByFilter: jest.fn().mockResolvedValue({ _id: 'cat-area' }),
  };
  const provaRepository = {};
  const service = new EnemService(
    simuladoRepository as any,
    categoriaRepository as any,
    provaRepository as any,
  );
  return { service, simuladoRepository, categoriaRepository };
}

function makeProva() {
  return {
    ano: 2023,
    criadorId: 'user-1',
    cursinhoId: 'curs-1',
    simulados: [] as any[],
    categoria: {
      nome: 'Enem Dia 1',
      exame: { _id: 'e1', nome: 'ENEM' },
    },
  } as any;
}

describe('EnemService.createSimuladoArea', () => {
  it('propaga criadorId e cursinhoId da prova para o simulado de área', async () => {
    const { service, simuladoRepository } = makeService();
    const prova = makeProva();

    await service.createSimuladoArea(prova, 'Matemática');

    const arg = simuladoRepository.create.mock.calls[0][0];
    expect(arg.nome).toBe('Enem Dia 1 2023 Matemática');
    expect(arg.criadorId).toBe('user-1');
    expect(arg.cursinhoId).toBe('curs-1');
  });

  it('mantém cursinhoId null quando a prova não tem cursinho', async () => {
    const { service, simuladoRepository } = makeService();
    const prova = makeProva();
    prova.cursinhoId = null;

    await service.createSimuladoArea(prova, 'Matemática');

    const arg = simuladoRepository.create.mock.calls[0][0];
    expect(arg.criadorId).toBe('user-1');
    expect(arg.cursinhoId).toBeNull();
  });
});

describe('EnemService.createSimuladoIdiomatica', () => {
  it('propaga criadorId e cursinhoId nos simulados Inglês e Espanhol', async () => {
    const { service, simuladoRepository } = makeService();
    const prova = makeProva();

    await service.createSimuladoIdiomatica(prova);

    const args = simuladoRepository.create.mock.calls.map((c) => c[0]);
    expect(args.length).toBeGreaterThanOrEqual(2);
    for (const arg of args) {
      expect(arg.criadorId).toBe('user-1');
      expect(arg.cursinhoId).toBe('curs-1');
    }
  });
});
