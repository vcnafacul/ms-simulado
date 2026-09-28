import { HttpStatus } from '@nestjs/common';
import { Ator } from 'src/shared/ator/ator';
import { Status } from './enums/status.enum';
import {
  recusaDoStatus,
  TEXTO_REVERTER_RECUSA,
  TEXTO_SEM_PERMISSAO_STATUS,
  TEXTO_USADA_POR_OUTROS,
} from './regra-do-status';

/** tickets/024, card 03 — a matriz do card 07. */
const ator = (o: Partial<Ator>): Ator => ({
  userId: 'u',
  cursinhoId: 'A',
  admin: false,
  editorCursinho: false,
  ...o,
});
const VA = ator({ validadorCursinho: true });
const Adm = ator({ cursinhoId: null, validadorProjeto: true });
const p = (cursinhoId: string | null, nome = 'P') => ({
  provaId: nome,
  provaNome: nome,
  cursinhoId,
});
const PA = p('A', 'PA');
const PB = p('B', 'PB');
const OF = p(null, 'ENEM');

describe('recusaDoStatus (024 · 03)', () => {
  it.each([
    ['Q1 só em PA', [PA]],
    ['Q2 em PA e PB', [PA, PB]],
    ['Q3 em PA e oficial', [PA, OF]],
    ['Q4 em nenhuma', []],
    ['Q5 só em PB', [PB]],
  ])('VA aprova pendente (%s) → pode', (_n, provas) => {
    expect(
      recusaDoStatus(Status.Pending, Status.Approved, provas, VA),
    ).toBeNull();
  });

  it.each([
    ['Q1 só em PA', [PA], true],
    ['Q4 em nenhuma', [], true],
    ['Q2 em PA e PB', [PA, PB], false],
    ['Q3 em PA e oficial', [PA, OF], false],
    ['Q5 só em PB', [PB], false],
  ])('VA recusa (%s) → pode? %s', (_n, provas, pode) => {
    const r = recusaDoStatus(Status.Pending, Status.Rejected, provas, VA);
    if (pode) expect(r).toBeNull();
    else
      expect(r).toEqual({
        status: HttpStatus.FORBIDDEN,
        message: TEXTO_USADA_POR_OUTROS,
        provas,
      });
  });

  it('VA recusa uma já APROVADA que está só em PA → pode', () => {
    expect(
      recusaDoStatus(Status.Approved, Status.Rejected, [PA], VA),
    ).toBeNull();
  });

  it('⚠️ VA não reverte uma recusa (recusada → aprovada)', () => {
    expect(
      recusaDoStatus(Status.Rejected, Status.Approved, [PA], VA)?.message,
    ).toBe(TEXTO_REVERTER_RECUSA);
  });

  it('⚠️ validador do cursinho sem cursinho (não é colaborador): nada é "dele"', () => {
    const semCursinho = ator({ cursinhoId: null, validadorCursinho: true });
    expect(
      recusaDoStatus(Status.Pending, Status.Rejected, [OF], semCursinho),
    ).not.toBeNull();
    expect(
      recusaDoStatus(Status.Pending, Status.Rejected, [], semCursinho),
    ).toBeNull();
  });

  it('a plataforma: tudo', () => {
    expect(
      recusaDoStatus(Status.Pending, Status.Rejected, [PA, PB, OF], Adm),
    ).toBeNull();
    expect(
      recusaDoStatus(Status.Rejected, Status.Approved, [PB], Adm),
    ).toBeNull();
  });

  it('⚠️ sem ator, ou só editor: não valida', () => {
    for (const quem of [
      undefined,
      ator({ editorCursinho: true, admin: true }),
    ]) {
      expect(
        recusaDoStatus(Status.Pending, Status.Approved, [], quem)?.message,
      ).toBe(TEXTO_SEM_PERMISSAO_STATUS);
    }
  });
});
