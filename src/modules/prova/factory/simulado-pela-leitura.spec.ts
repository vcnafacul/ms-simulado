import { simuladoPelaLeitura } from './simulado-pela-leitura';

/** tickets/038 (R8): ESP → Espanhol; ING, nenhuma ou as duas → Inglês. */
describe('simuladoPelaLeitura', () => {
  const dia1 = [
    { id: 's-ing', idioma: 'Inglês' },
    { id: 's-esp', idioma: 'Espanhol' },
  ];

  it.each([
    ['ESP', 's-esp'],
    ['ING', 's-ing'],
    ['', 's-ing'],
    ['INGESP', 's-ing'],
    [undefined, 's-ing'],
    [null, 's-ing'],
  ])('idioma lido %p → %s', (lido, esperado) => {
    expect(simuladoPelaLeitura(dia1, lido)).toBe(esperado);
  });

  it('a ordem dos simulados na prova não importa', () => {
    expect(simuladoPelaLeitura([...dia1].reverse(), 'ESP')).toBe('s-esp');
  });

  it('um simulado só (Dia 2): ele, sem olhar o cartão', () => {
    expect(simuladoPelaLeitura([{ id: 's-d2', idioma: null }], 'ESP')).toBe(
      's-d2',
    );
  });

  it('prova sem como decidir → null', () => {
    expect(simuladoPelaLeitura([{ id: 'a' }, { id: 'b' }], 'ESP')).toBeNull();
  });
});
