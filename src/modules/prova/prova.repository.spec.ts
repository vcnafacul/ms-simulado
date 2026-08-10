import { Types } from 'mongoose';
import { Status } from '../questao/enums/status.enum';
import { ProvaRepository } from './prova.repository';

describe('ProvaRepository.addQuestion (single-write questoes)', () => {
  it('empurra a questão em questoes e incrementa totalQuestaoValidadas quando aprovada', async () => {
    const prova: any = {
      _id: 'p1',
      questoes: [],
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
    await repo.addQuestion('p1', questao, 3);

    expect(prova.questoes).toHaveLength(1);
    expect(prova.questoes[0].numero).toBe(3);
    expect(prova.totalQuestaoValidadas).toBe(1);
    expect(updateOne).toHaveBeenCalledWith({ _id: 'p1' }, prova);
  });

  it('não incrementa totalQuestaoValidadas quando a questão não está aprovada', async () => {
    const prova: any = {
      _id: 'p1',
      questoes: [],
      totalQuestaoValidadas: 0,
    };
    const findById = jest.fn().mockResolvedValue(prova);
    const repo = new ProvaRepository({
      findById,
      updateOne: jest.fn().mockResolvedValue({}),
    } as any);

    await repo.addQuestion(
      'p1',
      {
        _id: new Types.ObjectId(),
        numero: 1,
        status: Status.Pending,
      } as any,
      1,
    );

    expect(prova.totalQuestaoValidadas).toBe(0);
  });
});

describe('ProvaRepository.removeQuestion (single-write questoes)', () => {
  it('remove de questoes e decrementa totalQuestaoValidadas quando aprovada', async () => {
    const alvo = new Types.ObjectId();
    const prova: any = {
      _id: 'p1',
      questoes: [{ questao: { _id: alvo }, numero: 1 }],
      totalQuestaoValidadas: 1,
    };
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const findById = jest.fn().mockResolvedValue(prova);
    const repo = new ProvaRepository({ findById, updateOne } as any);

    await repo.removeQuestion('p1', {
      _id: alvo,
      status: Status.Approved,
    } as any);

    expect(prova.questoes).toHaveLength(0);
    expect(prova.totalQuestaoValidadas).toBe(0);
    expect(updateOne).toHaveBeenCalledWith({ _id: 'p1' }, prova);
  });

  it('não decrementa quando a questão não estava no container', async () => {
    const prova: any = {
      _id: 'p1',
      questoes: [{ questao: { _id: new Types.ObjectId() }, numero: 1 }],
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

    expect(prova.questoes).toHaveLength(1);
    expect(prova.totalQuestaoValidadas).toBe(1);
  });
});

describe('ProvaRepository.getById (popula questoes.questao)', () => {
  it('popula questoes.questao no topo e aninhado nos simulados', async () => {
    const populateCalls: any[] = [];
    const query: any = {};
    query.populate = jest.fn((arg: any) => {
      populateCalls.push(arg);
      return query;
    });
    // torna a query "thenable" (getById faz await sem .exec())
    query.then = (resolve: any) => resolve({ _id: 'p1' });
    const findById = jest.fn().mockReturnValue(query);
    const repo = new ProvaRepository({ findById } as any);

    await repo.getById('p1');

    expect(findById).toHaveBeenCalledWith('p1');
    // populate top-level de questoes.questao
    expect(populateCalls).toContain('questoes.questao');
    // populate aninhado nos simulados inclui questoes.questao
    const nested = populateCalls.find(
      (c) => c && typeof c === 'object' && c.path === 'simulados',
    );
    expect(nested).toBeDefined();
    expect(nested.populate).toEqual(['categoria', { path: 'questoes.questao' }]);
  });
});

describe('ProvaRepository.getProvaWithQuestion (sem populate de questoes)', () => {
  it('popula categoria/exame e NÃO popula questoes', async () => {
    const populateArgs: any[] = [];
    const exec = jest.fn().mockResolvedValue({ _id: 'p1' });
    const query: any = { exec };
    query.populate = jest.fn((arg: any) => {
      populateArgs.push(arg);
      return query;
    });
    const findById = jest.fn().mockReturnValue(query);
    const repo = new ProvaRepository({ findById } as any);

    await repo.getProvaWithQuestion('p1');

    expect(findById).toHaveBeenCalledWith('p1');
    expect(populateArgs).not.toContain('questoes');
    expect(
      populateArgs.some(
        (a) => a && typeof a === 'object' && a.path === 'categoria',
      ),
    ).toBe(true);
  });
});
