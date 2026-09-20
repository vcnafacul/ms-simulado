import { NotFoundException } from '@nestjs/common';
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
      questoes: [{}, {}] as any[],
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
    expect(
      result.performanceMateriaFrente.materias[0].aproveitamento,
    ).toBeCloseTo(expected, 5);
    expect(
      result.performanceMateriaFrente.frentes[0].aproveitamento,
    ).toBeCloseTo(expected, 5);
    expect(result.historicos[0].totalQuestionsTest).toBe(2);
  });
});

describe('HistoricoService.getById (achata simulado.questoes)', () => {
  it('⚠️ repassa o DONO ao repositório — é o gate inteiro', async () => {
    // Sem isto, o service podia ignorar o `usuario` e chamar uma leitura por
    // id, e todos os outros testes deste bloco continuariam verdes.
    const repository: any = {
      getByIdAndUsuario: jest.fn().mockResolvedValue(null),
    };
    const svc = new HistoricoService(repository);

    await expect(svc.getById('h1', 'u-dono')).rejects.toThrow(
      NotFoundException,
    );

    expect(repository.getByIdAndUsuario).toHaveBeenCalledWith('h1', 'u-dono');
  });

  it('achata questoes.questao em simulado.questoes (subdoc → questao)', async () => {
    const historico = {
      toObject: () => ({
        _id: 'h1',
        simulado: {
          _id: 's1',
          nome: 'S',
          questoes: [
            { questao: { _id: 'q1', textoQuestao: 'a' }, numero: 1 },
            { questao: { _id: 'q2', textoQuestao: 'b' }, numero: 2 },
          ],
        },
      }),
    };
    const repository: any = {
      getByIdAndUsuario: jest.fn().mockResolvedValue(historico),
    };
    const service = new HistoricoService(repository);

    const result: any = await service.getById('h1', 'u1');

    // Achata pro shape do client preservando o numero do relacionamento (qc.numero).
    expect(result.simulado.questoes).toEqual([
      { _id: 'q1', textoQuestao: 'a', numero: 1 },
      { _id: 'q2', textoQuestao: 'b', numero: 2 },
    ]);
  });

  it('⚠️ a recusa é 404 LANÇADO, não um `null` devolvido', async () => {
    // Devolver o nil do repositório não virava 404: o Nest serializa `null`
    // como 200 com corpo vazio, a api repassava `''`, e o client rebentava
    // com `SyntaxError: Unexpected end of JSON input` num toast. Um 404 de
    // verdade é o que mantém o raciocínio "404, não 403" de pé na PONTA, e
    // não só neste arquivo.
    const repository: any = {
      getByIdAndUsuario: jest.fn().mockResolvedValue(null),
    };
    const service = new HistoricoService(repository);

    await expect(service.getById('x', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('⚠️ "não é seu" e "não existe" dão a MESMA resposta', async () => {
    // Um 403 num dos casos confirmaria a existência do histórico alheio a
    // quem perguntou — que é exatamente o que este card fecha.
    const naoExiste: any = {
      getByIdAndUsuario: jest.fn().mockResolvedValue(null),
    };
    const naoEhSeu: any = {
      getByIdAndUsuario: jest.fn().mockResolvedValue(undefined),
    };

    const erroA = await new HistoricoService(naoExiste)
      .getById('inexistente', 'u1')
      .catch((e) => e);
    const erroB = await new HistoricoService(naoEhSeu)
      .getById('h-alheio', 'u1')
      .catch((e) => e);

    expect(erroA.getStatus()).toBe(404);
    expect(erroB.getStatus()).toBe(404);
    expect(erroA.getResponse()).toEqual(erroB.getResponse());
  });
});

describe('HistoricoService — descrição da falha (card 01)', () => {
  it('getAllbyUser descreve a falha de cada histórico', async () => {
    const repository = {
      getAllByUser: jest.fn().mockResolvedValue({
        data: [
          {
            _id: 'h1',
            falha: { codigo: 'cartao_nao_detectado', detalhe: 'x' },
          },
          { _id: 'h2' },
        ],
        page: 1,
        limit: 10,
        totalItems: 2,
      }),
    };
    const svc = new HistoricoService(repository as any);

    const r: any = await svc.getAllbyUser({ page: 1, limit: 10 } as any);

    expect(r.data[0].falha).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'x',
      descricao: expect.stringContaining('Não foi possível localizar o cartão'),
      acaoSugerida: 'reenviar_foto',
    });
    // histórico sem falha continua sem falha — não se inventa uma
    expect(r.data[1].falha).toBeUndefined();
    // e a paginação sobrevive
    expect(r.totalItems).toBe(2);
  });

  it('getById descreve a falha', async () => {
    const repository = {
      getByIdAndUsuario: jest.fn().mockResolvedValue({
        _id: 'h1',
        falha: { codigo: 'motor_timeout' },
      }),
    };
    const svc = new HistoricoService(repository as any);

    const r: any = await svc.getById('h1', 'u1');

    expect(r.falha.acaoSugerida).toBe('reprocessar');
  });
});
