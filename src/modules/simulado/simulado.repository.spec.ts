import { SimuladoRepository } from './simulado.repository';

describe('SimuladoRepository.countByCategoria', () => {
  it('conta simulados não-deletados que referenciam a categoria', async () => {
    const countDocuments = jest.fn().mockResolvedValue(3);
    const repo = new SimuladoRepository({ countDocuments } as any);

    const total = await repo.countByCategoria('cat-123');

    expect(total).toBe(3);
    expect(countDocuments).toHaveBeenCalledWith({
      categoria: 'cat-123',
      deleted: { $ne: true },
    });
  });
});

describe('SimuladoRepository.updateDisponibilidade', () => {
  it('faz $set apenas com os campos fornecidos', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const repo = new SimuladoRepository({ updateOne } as any);

    const de = new Date('2026-01-10T00:00:00.000Z');
    await repo.updateDisponibilidade('sim-1', { disponivelDe: de });

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'sim-1' },
      { $set: { disponivelDe: de } },
    );
  });

  it('propaga null explícito no $set (para limpar)', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const repo = new SimuladoRepository({ updateOne } as any);

    await repo.updateDisponibilidade('sim-1', {
      disponivelDe: null,
      disponivelAte: null,
    });

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'sim-1' },
      { $set: { disponivelDe: null, disponivelAte: null } },
    );
  });
});

describe('SimuladoRepository.getAvailable', () => {
  it('filtra por categoria, desbloqueado e dentro da janela temporal', async () => {
    const select = jest.fn().mockResolvedValue([{ _id: 's1', nome: 'S1' }]);
    const find = jest.fn().mockReturnValue({ select });
    const repo = new SimuladoRepository({ find } as any);

    const result = await repo.getAvailable('cat-1');

    expect(result).toEqual([{ _id: 's1', nome: 'S1' }]);
    const filtro = find.mock.calls[0][0];
    expect(filtro.categoria).toBe('cat-1');
    expect(filtro.bloqueado).toBe(false);
    // janela: disponivelDe null OU <= agora ; disponivelAte null OU >= agora
    expect(filtro.$and).toHaveLength(2);
    expect(filtro.$and[0].$or[0]).toEqual({ disponivelDe: null });
    expect(filtro.$and[0].$or[1].disponivelDe.$lte).toBeInstanceOf(Date);
    expect(filtro.$and[1].$or[0]).toEqual({ disponivelAte: null });
    expect(filtro.$and[1].$or[1].disponivelAte.$gte).toBeInstanceOf(Date);
    expect(select).toHaveBeenCalledWith(['nome', '_id']);
  });
});

describe('SimuladoRepository.getAvailabilityById', () => {
  it('lê só os campos de disponibilidade, sem populate', async () => {
    const exec = jest.fn().mockResolvedValue({
      bloqueado: false,
      disponivelDe: null,
      disponivelAte: null,
    });
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    const findById = jest.fn().mockReturnValue({ select });
    const repo = new SimuladoRepository({ findById } as any);

    const result = await repo.getAvailabilityById('sim-1');

    expect(findById).toHaveBeenCalledWith('sim-1');
    expect(select).toHaveBeenCalledWith('bloqueado disponivelDe disponivelAte');
    expect(result).toEqual({
      bloqueado: false,
      disponivelDe: null,
      disponivelAte: null,
    });
  });
});

describe('SimuladoRepository.answer (popula questoes.questao)', () => {
  it('popula questoes.questao com frente1/materia e alternativa', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 's1', questoes: [] });
    const populate = jest.fn().mockReturnValue({ exec });
    const findById = jest.fn().mockReturnValue({ populate });
    const repo = new SimuladoRepository({ findById } as any);

    await repo.answer('s1');

    expect(findById).toHaveBeenCalledWith('s1');
    expect(populate).toHaveBeenCalledWith({
      path: 'questoes.questao',
      populate: ['frente1', 'materia'],
      select: 'alternativa',
    });
  });
});

describe('SimuladoRepository.incrementarCartaoSeq', () => {
  it('faz $inc atômico e devolve o novo valor', async () => {
    const findByIdAndUpdate = jest.fn().mockResolvedValue({ cartaoSeq: 8 });
    const repo = new SimuladoRepository({ findByIdAndUpdate } as any);

    const seq = await repo.incrementarCartaoSeq('665abc');

    expect(seq).toBe(8);
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      '665abc',
      { $inc: { cartaoSeq: 1 } },
      { new: true },
    );
  });

  it('devolve 0 quando o simulado não existe', async () => {
    const findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    const repo = new SimuladoRepository({ findByIdAndUpdate } as any);

    const seq = await repo.incrementarCartaoSeq('inexistente');

    expect(seq).toBe(0);
  });
});

describe('SimuladoRepository.getById (popula questoes.questao)', () => {
  it('popula categoria + questoes.questao', async () => {
    const populateArgs: any[] = [];
    const exec = jest.fn().mockResolvedValue({ _id: 's1' });
    const query: any = { exec };
    query.populate = jest.fn((arg: any) => {
      populateArgs.push(arg);
      return query;
    });
    const findById = jest.fn().mockReturnValue(query);
    const repo = new SimuladoRepository({ findById } as any);

    await repo.getById('s1');

    expect(populateArgs).toContainEqual({
      path: 'questoes.questao',
      populate: ['frente1', 'materia'],
    });
  });
});
