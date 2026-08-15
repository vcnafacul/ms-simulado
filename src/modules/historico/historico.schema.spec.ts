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
