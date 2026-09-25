import { HistoricoSchema } from './historico.schema';

describe('Historico schema — campos de cartão (A2)', () => {
  it('tem imageKey e cartaoCode nos paths', () => {
    expect(HistoricoSchema.path('imageKey')).toBeDefined();
    expect(HistoricoSchema.path('cartaoCode')).toBeDefined();
  });

  it('índice único PARCIAL em imageKey', () => {
    const idx = HistoricoSchema.indexes().find(
      ([fields]) => (fields as Record<string, unknown>).imageKey === 1,
    );
    expect(idx).toBeDefined();
    const opts = idx![1] as Record<string, unknown>;
    expect(opts.unique).toBe(true);
    expect(opts.partialFilterExpression).toEqual({
      imageKey: { $type: 'string' },
    });
  });
});

describe('Historico schema — campo de falha (card 01)', () => {
  it('tem o path falha', () => {
    expect(HistoricoSchema.path('falha')).toBeDefined();
  });
});

describe('Historico schema — um cartão por estudante (QA)', () => {
  it('⚠️ índice único parcial em (usuario, simulado, cartaoCode), com nome', () => {
    const idx = HistoricoSchema.indexes().find(
      ([, opts]) => (opts as { name?: string }).name === 'cartao_por_estudante',
    );
    expect(idx).toBeDefined();
    expect(idx![0]).toEqual({ usuario: 1, simulado: 1, cartaoCode: 1 });
    expect(idx![1]).toMatchObject({
      unique: true,
      partialFilterExpression: { cartaoCode: { $type: 'string' } },
    });
  });
});
