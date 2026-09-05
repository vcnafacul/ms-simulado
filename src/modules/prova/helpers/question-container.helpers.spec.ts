import { Types } from 'mongoose';
import { Status } from '../../questao/enums/status.enum';
import {
  addQuestaoToContainer,
  removeQuestaoFromContainer,
  syncNumeroNaProvaESimulados,
  updateNumeroNoContainer,
} from './question-container.helpers';

describe('question-container.helpers', () => {
  it('addQuestaoToContainer empurra { questao, numero } com o objeto completo', () => {
    const container: any = { questoes: [] };
    const questao: any = {
      _id: new Types.ObjectId(),
      numero: 7,
      status: 'approved',
    };

    addQuestaoToContainer(container, questao, 7);

    expect(container.questoes).toHaveLength(1);
    expect(container.questoes[0].numero).toBe(7);
    // objeto completo preservado (permite ler .status em memória)
    expect(container.questoes[0].questao).toBe(questao);
    expect(container.questoes[0].questao.status).toBe('approved');
  });

  it('permite duas questões com o mesmo numero (idiomáticas ENEM, sem dedupe)', () => {
    const container: any = { questoes: [] };
    const q1: any = { _id: new Types.ObjectId(), numero: 1 };
    const q2: any = { _id: new Types.ObjectId(), numero: 1 };

    addQuestaoToContainer(container, q1, 1);
    addQuestaoToContainer(container, q2, 1);

    expect(container.questoes).toHaveLength(2);
    expect(container.questoes.map((qc: any) => qc.numero)).toEqual([1, 1]);
  });

  it('removeQuestaoFromContainer remove por id quando questao é objeto completo', () => {
    const id = new Types.ObjectId();
    const outro = new Types.ObjectId();
    const container: any = {
      questoes: [
        { questao: { _id: id }, numero: 1 },
        { questao: { _id: outro }, numero: 2 },
      ],
    };

    removeQuestaoFromContainer(container, id);

    expect(container.questoes).toHaveLength(1);
    expect(container.questoes[0].questao._id).toBe(outro);
  });

  it('removeQuestaoFromContainer remove por id quando questao é ObjectId cru (ref não populada)', () => {
    const id = new Types.ObjectId();
    const outro = new Types.ObjectId();
    const container: any = {
      questoes: [
        { questao: id, numero: 1 },
        { questao: outro, numero: 2 },
      ],
    };

    removeQuestaoFromContainer(container, id);

    expect(container.questoes).toHaveLength(1);
    expect(container.questoes[0].questao).toBe(outro);
  });
});

describe('syncNumeroNaProvaESimulados', () => {
  it('atualiza numero na prova e nos simulados que contem a questao', async () => {
    const sml = { questoes: [{ questao: { _id: 'q1' }, numero: 5 }] };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: 5 }],
      simulados: [sml],
    };
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    await syncNumeroNaProvaESimulados(
      provaRepository as any,
      simuladoRepository as any,
      'p1',
      'q1',
      9,
    );

    expect(prova.questoes[0].numero).toBe(9);
    expect(sml.questoes[0].numero).toBe(9);
    expect(provaRepository.update).toHaveBeenCalledWith(prova, undefined);
    expect(simuladoRepository.update).toHaveBeenCalledWith(sml, undefined);
  });

  it('nao persiste quando numero nao muda', async () => {
    const sml = { questoes: [{ questao: { _id: 'q1' }, numero: 9 }] };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: 9 }],
      simulados: [sml],
    };
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn(),
    };
    const simuladoRepository = { update: jest.fn() };

    await syncNumeroNaProvaESimulados(
      provaRepository as any,
      simuladoRepository as any,
      'p1',
      'q1',
      9,
    );

    expect(provaRepository.update).not.toHaveBeenCalled();
    expect(simuladoRepository.update).not.toHaveBeenCalled();
  });

  it('re-bloqueia o simulado liberado quando o número é removido', async () => {
    const sml = {
      categoria: { quantidadeTotalQuestao: 2 },
      questoes: [
        { questao: { _id: 'q1', status: Status.Approved }, numero: 1 },
        { questao: { _id: 'q2', status: Status.Approved }, numero: 2 },
      ],
      bloqueado: false,
    };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: 1 }],
      simulados: [sml],
    };
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    await syncNumeroNaProvaESimulados(
      provaRepository as any,
      simuladoRepository as any,
      'p1',
      'q1',
      null,
    );

    expect(sml.questoes[0].numero).toBeNull();
    expect(sml.bloqueado).toBe(true);
    expect(simuladoRepository.update).toHaveBeenCalledWith(sml, undefined);
  });

  it('libera o simulado travado só pela falta de número quando ele é preenchido', async () => {
    const sml = {
      categoria: { quantidadeTotalQuestao: 2 },
      questoes: [
        {
          questao: { _id: 'q1', status: Status.Approved },
          numero: null as number | null,
        },
        { questao: { _id: 'q2', status: Status.Approved }, numero: 2 },
      ],
      bloqueado: true,
    };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: null as number | null }],
      simulados: [sml],
    };
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    await syncNumeroNaProvaESimulados(
      provaRepository as any,
      simuladoRepository as any,
      'p1',
      'q1',
      1,
    );

    expect(sml.bloqueado).toBe(false);
    expect(simuladoRepository.update).toHaveBeenCalledWith(sml, undefined);
  });

  it('não revalida simulado que não contém a questão (numero não mudou)', async () => {
    const sml = {
      categoria: { quantidadeTotalQuestao: 1 },
      questoes: [
        { questao: { _id: 'outra', status: Status.Approved }, numero: 1 },
      ],
      bloqueado: true,
    };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: 5 }],
      simulados: [sml],
    };
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository = { update: jest.fn() };

    await syncNumeroNaProvaESimulados(
      provaRepository as any,
      simuladoRepository as any,
      'p1',
      'q1',
      9,
    );

    // Sem vínculo com a questão editada: estado preservado, sem write.
    expect(sml.bloqueado).toBe(true);
    expect(simuladoRepository.update).not.toHaveBeenCalled();
  });

  it('retorna sem erro quando prova não existe', async () => {
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const simuladoRepository = { update: jest.fn() };

    await expect(
      syncNumeroNaProvaESimulados(
        provaRepository as any,
        simuladoRepository as any,
        'p-missing',
        'q1',
        9,
      ),
    ).resolves.toBeUndefined();

    expect(provaRepository.update).not.toHaveBeenCalled();
    expect(simuladoRepository.update).not.toHaveBeenCalled();
  });

  it('propaga numero null (limpar numero) na prova e nos simulados', async () => {
    const sml = { questoes: [{ questao: { _id: 'q1' }, numero: 5 }] };
    const prova = {
      _id: 'p1',
      questoes: [{ questao: { _id: 'q1' }, numero: 5 }],
      simulados: [sml],
    };
    const provaRepository = {
      getById: jest.fn().mockResolvedValue(prova),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const simuladoRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    await syncNumeroNaProvaESimulados(
      provaRepository as any,
      simuladoRepository as any,
      'p1',
      'q1',
      null,
    );

    expect(prova.questoes[0].numero).toBeNull();
    expect(sml.questoes[0].numero).toBeNull();
    expect(provaRepository.update).toHaveBeenCalledWith(prova, undefined);
    expect(simuladoRepository.update).toHaveBeenCalledWith(sml, undefined);
  });
});

describe('updateNumeroNoContainer', () => {
  it('atualiza o numero da entry correta e retorna true (questao objeto completo)', () => {
    const alvo = new Types.ObjectId();
    const outro = new Types.ObjectId();
    const container: any = {
      questoes: [
        { questao: { _id: alvo }, numero: 5 },
        { questao: { _id: outro }, numero: 6 },
      ],
    };

    const changed = updateNumeroNoContainer(container, alvo, 42);

    expect(changed).toBe(true);
    expect(container.questoes[0].numero).toBe(42);
    expect(container.questoes[1].numero).toBe(6);
  });

  it('funciona com questao sendo ObjectId cru (ref não populada)', () => {
    const alvo = new Types.ObjectId();
    const container: any = {
      questoes: [{ questao: alvo, numero: 5 }],
    };

    const changed = updateNumeroNoContainer(container, alvo, 9);

    expect(changed).toBe(true);
    expect(container.questoes[0].numero).toBe(9);
  });

  it('retorna false quando o numero já é o esperado (no-op)', () => {
    const alvo = new Types.ObjectId();
    const container: any = {
      questoes: [{ questao: { _id: alvo }, numero: 7 }],
    };

    const changed = updateNumeroNoContainer(container, alvo, 7);

    expect(changed).toBe(false);
    expect(container.questoes[0].numero).toBe(7);
  });

  it('retorna false quando a questão não está no container', () => {
    const container: any = {
      questoes: [{ questao: { _id: new Types.ObjectId() }, numero: 1 }],
    };

    const changed = updateNumeroNoContainer(container, new Types.ObjectId(), 3);

    expect(changed).toBe(false);
  });
});
