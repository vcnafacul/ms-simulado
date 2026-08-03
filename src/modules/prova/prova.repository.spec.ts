import { Types } from 'mongoose';
import { Status } from '../questao/enums/status.enum';
import { ProvaRepository } from './prova.repository';

describe('ProvaRepository.addQuestion (single-write questoesNovo)', () => {
  it('empurra a questão em questoesNovo e incrementa totalQuestaoValidadas quando aprovada', async () => {
    const prova: any = {
      _id: 'p1',
      questoes: [],
      questoesNovo: [],
      totalQuestaoValidadas: 0,
    };
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const findById = jest.fn().mockResolvedValue(prova);
    const repo = new ProvaRepository({ findById, updateOne } as any);

    const questao: any = {
      _id: new Types.ObjectId(),
      numero: 3,
      status: Status.Approved,
    };
    await repo.addQuestion('p1', questao);

    expect(prova.questoesNovo).toHaveLength(1);
    expect(prova.questoesNovo[0].numero).toBe(3);
    expect(prova.questoes).toHaveLength(0); // array antigo congelado
    expect(prova.totalQuestaoValidadas).toBe(1);
    expect(updateOne).toHaveBeenCalledWith({ _id: 'p1' }, prova);
  });

  it('não incrementa totalQuestaoValidadas quando a questão não está aprovada', async () => {
    const prova: any = {
      _id: 'p1',
      questoes: [],
      questoesNovo: [],
      totalQuestaoValidadas: 0,
    };
    const findById = jest.fn().mockResolvedValue(prova);
    const repo = new ProvaRepository({
      findById,
      updateOne: jest.fn().mockResolvedValue({}),
    } as any);

    await repo.addQuestion('p1', {
      _id: new Types.ObjectId(),
      numero: 1,
      status: Status.Pending,
    } as any);

    expect(prova.totalQuestaoValidadas).toBe(0);
  });
});

describe('ProvaRepository.removeQuestion (single-write questoesNovo)', () => {
  it('remove de questoesNovo e decrementa totalQuestaoValidadas quando aprovada', async () => {
    const alvo = new Types.ObjectId();
    const prova: any = {
      _id: 'p1',
      questoes: [],
      questoesNovo: [{ questao: { _id: alvo }, numero: 1 }],
      totalQuestaoValidadas: 1,
    };
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const findById = jest.fn().mockResolvedValue(prova);
    const repo = new ProvaRepository({ findById, updateOne } as any);

    await repo.removeQuestion('p1', {
      _id: alvo,
      status: Status.Approved,
    } as any);

    expect(prova.questoesNovo).toHaveLength(0);
    expect(prova.totalQuestaoValidadas).toBe(0);
    expect(updateOne).toHaveBeenCalledWith({ _id: 'p1' }, prova);
  });

  it('não decrementa quando a questão não estava no container', async () => {
    const prova: any = {
      _id: 'p1',
      questoes: [],
      questoesNovo: [{ questao: { _id: new Types.ObjectId() }, numero: 1 }],
      totalQuestaoValidadas: 1,
    };
    const findById = jest.fn().mockResolvedValue(prova);
    const repo = new ProvaRepository({
      findById,
      updateOne: jest.fn().mockResolvedValue({}),
    } as any);

    await repo.removeQuestion('p1', {
      _id: new Types.ObjectId(),
      status: Status.Approved,
    } as any);

    expect(prova.questoesNovo).toHaveLength(1);
    expect(prova.totalQuestaoValidadas).toBe(1);
  });
});
