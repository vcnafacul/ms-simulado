import { parseSimuladoId } from './imagekey.util';

describe('parseSimuladoId', () => {
  it('extrai o simuladoId (com extensão)', () => {
    expect(parseSimuladoId('cartoes/665abc/img-1.jpg')).toBe('665abc');
  });
  it.each(['', 'cartoes/só-um', 'outro/665/img', 'cartoes/665/a/b'])(
    'rejeita %p',
    (k) => {
      expect(() => parseSimuladoId(k)).toThrow();
    },
  );
});
