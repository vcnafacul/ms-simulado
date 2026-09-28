import { lerAtor } from './ator';

describe('lerAtor — header x-ator (023 · 03)', () => {
  const ok = {
    userId: 'u',
    cursinhoId: 'c',
    admin: false,
    editorCursinho: true,
  };

  it('lê o JSON que a api manda', () => {
    // os validadores (024) entram sempre, false quando ausentes
    const lido = { ...ok, validadorProjeto: false, validadorCursinho: false };
    expect(lerAtor(JSON.stringify(ok))).toEqual(lido);
    expect(lerAtor(JSON.stringify({ ...ok, cursinhoId: null }))).toEqual({
      ...lido,
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

describe('lerAtor — validadores (024 · 03)', () => {
  const base = {
    userId: 'u',
    cursinhoId: 'c',
    admin: false,
    editorCursinho: false,
  };
  it('lê os validadores; ausentes ou não-booleanos = false', () => {
    expect(
      lerAtor(JSON.stringify({ ...base, validadorCursinho: true })),
    ).toMatchObject({
      validadorCursinho: true,
      validadorProjeto: false,
    });
    expect(
      lerAtor(JSON.stringify({ ...base, validadorProjeto: 'true' })),
    ).toMatchObject({
      validadorProjeto: false,
    });
  });
});
