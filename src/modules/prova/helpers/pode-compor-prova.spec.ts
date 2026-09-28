import { Ator } from 'src/shared/ator/ator';
import { DONO_SYSTEM } from '../../categoria/schemas/categoria.schema';
import {
  motivoParaNaoComporProva,
  podeComporProva,
  provaProtegida,
  resumoDoDono,
  TEXTO_OFICIAL,
  TEXTO_OUTRO_CURSINHO,
} from './pode-compor-prova';

/** tickets/023, card 03 — a matriz da R2 (README e card 12). */
const catDe = (dono: string, selecionavel = true) => ({ dono, selecionavel });
const PA = { cursinhoId: 'A', categoria: catDe('A') };
const PB = { cursinhoId: 'B', categoria: catDe('B') };
const PP = { cursinhoId: null as string | null, categoria: catDe(DONO_SYSTEM) };
const PAs = { cursinhoId: 'A', categoria: catDe(DONO_SYSTEM) };
const PAns = { cursinhoId: 'A', categoria: catDe('A', false) };
const legada = { categoria: catDe(DONO_SYSTEM) }; // sem o campo cursinhoId

const ator = (o: Partial<Ator>): Ator => ({
  userId: 'u',
  cursinhoId: null,
  admin: false,
  editorCursinho: false,
  ...o,
});
const A = ator({ cursinhoId: 'A', editorCursinho: true });
const B = ator({ cursinhoId: 'B', editorCursinho: true });
const Adm = ator({ admin: true });
const AdmA = ator({ cursinhoId: 'A', admin: true, editorCursinho: true });
const Amenos = ator({ cursinhoId: 'A' });

describe('podeComporProva (023 · 03)', () => {
  it.each([
    ['A', A, [true, false, false, false]],
    ['B', B, [false, true, false, false]],
    ['Adm', Adm, [false, false, true, false]],
    ['Adm+A', AdmA, [true, false, true, false]],
    ['A−', Amenos, [false, false, false, false]],
  ])('%s em PA, PB, PP, PAs', (_n, quem, esperado) => {
    expect(
      [PA, PB, PP, PAs].map((p) => podeComporProva(p, quem as Ator)),
    ).toEqual(esperado);
  });

  it('categoria não selecionável protege até do dono', () => {
    expect(podeComporProva(PAns, A)).toBe(false);
    expect(motivoParaNaoComporProva(PAns, A)).toBe(TEXTO_OFICIAL);
  });

  it('⚠️ prova sem o campo cursinhoId é da plataforma', () => {
    expect(podeComporProva(legada, Adm)).toBe(true);
    expect(podeComporProva(legada, A)).toBe(false);
  });

  it('⚠️ sem ator, nunca', () => {
    expect(podeComporProva(PP, undefined)).toBe(false);
    expect(motivoParaNaoComporProva(PP, undefined)).toBe(TEXTO_OFICIAL);
    expect(motivoParaNaoComporProva(PA, undefined)).toBe(TEXTO_OUTRO_CURSINHO);
  });

  it('mensagens: outro cursinho × oficial', () => {
    expect(motivoParaNaoComporProva(PA, B)).toBe(TEXTO_OUTRO_CURSINHO);
    expect(motivoParaNaoComporProva(PA, Adm)).toBe(TEXTO_OUTRO_CURSINHO);
    expect(motivoParaNaoComporProva(PP, A)).toBe(TEXTO_OFICIAL);
    expect(motivoParaNaoComporProva(PAs, A)).toBe(TEXTO_OFICIAL);
    expect(motivoParaNaoComporProva(PA, A)).toBeNull();
  });

  it('provaProtegida: system ou não selecionável; categoria ausente conta como system', () => {
    expect(provaProtegida(catDe(DONO_SYSTEM))).toBe(true);
    expect(provaProtegida(catDe('A', false))).toBe(true);
    expect(provaProtegida(catDe('A'))).toBe(false);
    expect(provaProtegida(null)).toBe(true);
  });

  it('resumoDoDono (023 · 07)', () => {
    expect(resumoDoDono({ ...PA, receberNovasVersoes: true }, A)).toEqual({
      cursinhoId: 'A',
      protegida: false,
      selecionavel: true,
      receberNovasVersoes: true,
      podeComporProva: true,
    });
    expect(resumoDoDono(PAns, A)).toMatchObject({
      protegida: true,
      selecionavel: false,
      receberNovasVersoes: false,
      podeComporProva: false,
    });
    expect(resumoDoDono(legada, Adm)).toMatchObject({
      cursinhoId: null,
      podeComporProva: true,
    });
  });
});
