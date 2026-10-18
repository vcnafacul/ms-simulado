import { DONO_SYSTEM } from '../../categoria/schemas/categoria.schema';
import { podeAnularNaProva } from './pode-compor-prova';

describe('podeAnularNaProva (042/03, D3-aberta saída a)', () => {
  const doCursinho = {
    cursinhoId: 'c1',
    categoria: { dono: 'c1', selecionavel: true },
  };
  const oficial = {
    cursinhoId: null as string | null,
    categoria: { dono: DONO_SYSTEM },
  };
  const ator = (o = {}) => ({
    userId: 'u',
    cursinhoId: null as string | null,
    admin: false,
    editorCursinho: false,
    ...o,
  });

  it.each([
    [
      'editor do cursinho dono',
      doCursinho,
      ator({ cursinhoId: 'c1', editorCursinho: true }),
      true,
    ],
    [
      'editor de outro cursinho',
      doCursinho,
      ator({ cursinhoId: 'c2', editorCursinho: true }),
      false,
    ],
    [
      'editor de cursinho na oficial',
      oficial,
      ator({ cursinhoId: 'c1', editorCursinho: true }),
      false,
    ],
    ['admin na prova do cursinho', doCursinho, ator({ admin: true }), true],
    ['admin na oficial', oficial, ator({ admin: true }), true],
    [
      'colaborador sem permissão',
      doCursinho,
      ator({ cursinhoId: 'c1' }),
      false,
    ],
  ])('%s → %s', (_, prova, a, esperado) => {
    expect(podeAnularNaProva(prova, a)).toBe(esperado);
  });

  it('sem ator → não', () => {
    expect(podeAnularNaProva(doCursinho)).toBe(false);
  });
});
