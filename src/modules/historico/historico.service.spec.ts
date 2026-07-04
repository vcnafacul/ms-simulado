import { HistoricoService } from './historico.service';
import { AproveitamentoHistorico } from './types/aproveitamento';

function makeAproveitamento(
  materiaAprov: number,
  frenteAprov: number,
): AproveitamentoHistorico {
  return {
    geral: materiaAprov,
    materias: [
      {
        id: 'mat-1',
        nome: 'Matemática',
        aproveitamento: materiaAprov,
        frentes: [
          {
            id: 'frt-1',
            nome: 'Álgebra',
            aproveitamento: frenteAprov,
            materia: 'Matemática',
          },
        ],
      },
    ],
  } as unknown as AproveitamentoHistorico;
}

function makeHistorico(aproveitamento: AproveitamentoHistorico) {
  return {
    _id: 'hist-id',
    simulado: {
      nome: 'Simulado',
      questoes: [] as any[],
      aproveitamento: 0,
      vezesRespondido: 0,
    },
    aproveitamento,
    tempoRealizado: 60,
    questoesRespondidas: 10,
    createdAt: new Date(),
  };
}

const mockRepository = {
  getToPerformance: jest.fn(),
};

function makeService(): HistoricoService {
  return new HistoricoService(mockRepository as any);
}

describe('HistoricoService.calcularMediaAproveitamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calcula média correta para 3 históricos na mesma matéria com aproveitamentos distintos', async () => {
    // sem o fix: 3º histórico usa times=1 do Map (não atualizado), dando 0.825 errado
    mockRepository.getToPerformance.mockResolvedValue([
      makeHistorico(makeAproveitamento(0.5, 0.5)),
      makeHistorico(makeAproveitamento(0.8, 0.8)),
      makeHistorico(makeAproveitamento(1.0, 1.0)),
    ]);

    const result = await makeService().getPerformance('user-1');

    const expected = (0.5 + 0.8 + 1.0) / 3; // ≈ 0.7667
    expect(result.performanceMateriaFrente.materias[0].aproveitamento).toBeCloseTo(expected, 5);
    expect(result.performanceMateriaFrente.frentes[0].aproveitamento).toBeCloseTo(expected, 5);
  });
});
