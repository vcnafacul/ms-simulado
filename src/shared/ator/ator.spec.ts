import { lerAtor } from './ator';

describe('lerAtor — header x-ator (023 · 03)', () => {
  const ok = {
    userId: 'u',
    cursinhoId: 'c',
    admin: false,
    editorCursinho: true,
  };

  it('lê o JSON que a api manda', () => {
    expect(lerAtor(JSON.stringify(ok))).toEqual(ok);
    expect(lerAtor(JSON.stringify({ ...ok, cursinhoId: null }))).toEqual({
      ...ok,
      cursinhoId: null,
    });
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['JSON inválido', '{'],
    ['sem userId', JSON.stringify({ ...ok, userId: undefined })],
    ['admin não booleano', JSON.stringify({ ...ok, admin: 'true' })],
    ['cursinhoId número', JSON.stringify({ ...ok, cursinhoId: 1 })],
    ['array', '[]'],
  ])('⚠️ %s → sem ator', (_n, header) => {
    expect(lerAtor(header)).toBeUndefined();
  });
});
