import { getAvailabilityStatus, isSimuladoAvailable } from './availability';

// Datas fixas de referência (UTC) para determinismo — sem depender do relógio real.
const DE = new Date('2026-01-10T00:00:00.000Z');
const ATE = new Date('2026-01-20T00:00:00.000Z');
const ANTES = new Date('2026-01-05T00:00:00.000Z');
const DENTRO = new Date('2026-01-15T00:00:00.000Z');
const DEPOIS = new Date('2026-01-25T00:00:00.000Z');

describe('isSimuladoAvailable', () => {
  it('false quando bloqueado, independente da janela', () => {
    expect(isSimuladoAvailable({ bloqueado: true }, DENTRO)).toBe(false);
    expect(
      isSimuladoAvailable(
        { bloqueado: true, disponivelDe: DE, disponivelAte: ATE },
        DENTRO,
      ),
    ).toBe(false);
  });

  it('true sem janela (null/null) quando desbloqueado', () => {
    expect(
      isSimuladoAvailable(
        { bloqueado: false, disponivelDe: null, disponivelAte: null },
        DENTRO,
      ),
    ).toBe(true);
  });

  it('true quando desbloqueado, sem janela', () => {
    expect(isSimuladoAvailable({ bloqueado: false }, DENTRO)).toBe(true);
  });

  it('só de: false antes, true no limite e depois de disponivelDe', () => {
    const s = {
      bloqueado: false,
      disponivelDe: DE,
      disponivelAte: null,
    } as any;
    expect(isSimuladoAvailable(s, ANTES)).toBe(false);
    expect(isSimuladoAvailable(s, DE)).toBe(true); // limite inclusivo
    expect(isSimuladoAvailable(s, DEPOIS)).toBe(true);
  });

  it('só até: true antes e no limite, false depois de disponivelAte', () => {
    const s = {
      bloqueado: false,
      disponivelDe: null,
      disponivelAte: ATE,
    } as any;
    expect(isSimuladoAvailable(s, ANTES)).toBe(true);
    expect(isSimuladoAvailable(s, ATE)).toBe(true); // limite inclusivo
    expect(isSimuladoAvailable(s, DEPOIS)).toBe(false);
  });

  it('de + até: false antes, true dentro, false depois', () => {
    const s = { bloqueado: false, disponivelDe: DE, disponivelAte: ATE };
    expect(isSimuladoAvailable(s, ANTES)).toBe(false);
    expect(isSimuladoAvailable(s, DENTRO)).toBe(true);
    expect(isSimuladoAvailable(s, DEPOIS)).toBe(false);
  });
});

describe('getAvailabilityStatus', () => {
  it("'bloqueado' quando bloqueado, independente da janela", () => {
    expect(getAvailabilityStatus({ bloqueado: true }, DENTRO)).toBe(
      'bloqueado',
    );
    expect(
      getAvailabilityStatus(
        { bloqueado: true, disponivelDe: DE, disponivelAte: ATE },
        ANTES,
      ),
    ).toBe('bloqueado');
  });

  it("'disponivel' sem janela quando desbloqueado", () => {
    expect(
      getAvailabilityStatus(
        { bloqueado: false, disponivelDe: null, disponivelAte: null },
        DENTRO,
      ),
    ).toBe('disponivel');
  });

  it("'antes_da_janela' quando now < disponivelDe", () => {
    expect(
      getAvailabilityStatus(
        { bloqueado: false, disponivelDe: DE, disponivelAte: ATE },
        ANTES,
      ),
    ).toBe('antes_da_janela');
  });

  it("'disponivel' quando dentro da janela", () => {
    expect(
      getAvailabilityStatus(
        { bloqueado: false, disponivelDe: DE, disponivelAte: ATE },
        DENTRO,
      ),
    ).toBe('disponivel');
  });

  it("'depois_da_janela' quando now > disponivelAte", () => {
    expect(
      getAvailabilityStatus(
        { bloqueado: false, disponivelDe: DE, disponivelAte: ATE },
        DEPOIS,
      ),
    ).toBe('depois_da_janela');
  });

  it('limites inclusivos: disponivel exatamente em disponivelDe e disponivelAte', () => {
    const s = { bloqueado: false, disponivelDe: DE, disponivelAte: ATE };
    expect(getAvailabilityStatus(s, DE)).toBe('disponivel');
    expect(getAvailabilityStatus(s, ATE)).toBe('disponivel');
  });
});
