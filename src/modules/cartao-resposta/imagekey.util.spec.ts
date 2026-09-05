import { parseSimuladoId } from './imagekey.util';

describe('parseSimuladoId', () => {
  it('extrai o simuladoId (com extensão)', () => {
    expect(parseSimuladoId('cartoes/665f0c1a2b3c4d5e6f00abc1/img-1.jpg')).toBe(
      '665f0c1a2b3c4d5e6f00abc1',
    );
  });
  it.each([
    '',
    'cartoes/só-um',
    'outro/665/img',
    'cartoes/665/a/b',
    'cartoes/665abc/i.jpg', // formato ok, mas simuladoId não é ObjectId → 400
  ])('rejeita %p', (k) => {
    expect(() => parseSimuladoId(k)).toThrow();
  });
});
