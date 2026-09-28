import { Ator } from 'src/shared/ator/ator';
import { DONO_SYSTEM } from '../../categoria/schemas/categoria.schema';

/**
 * Quem pode mexer na **composição** de uma prova — adicionar, remover, trocar
 * número, criar questão já dentro dela (tickets/023, card 03, regra R2).
 *
 * Ver é livre (R1) e editar o conteúdo da questão também (R4). O que tem dono
 * é quais questões estão na prova.
 */

type CategoriaDaProva = { dono?: string | null; selecionavel?: boolean | null };
type ProvaComDono = {
  cursinhoId?: string | null;
  categoria?: CategoriaDaProva | null;
};

/** Categoria da plataforma ou fora de uso: a prova é oficial. */
export function provaProtegida(categoria?: CategoriaDaProva | null): boolean {
  return (
    (categoria?.dono ?? DONO_SYSTEM) === DONO_SYSTEM ||
    categoria?.selecionavel === false
  );
}

export function podeComporProva(prova: ProvaComDono, ator?: Ator): boolean {
  if (!ator) return false;
  // ⚠️ Sem o campo = prova legada = da plataforma.
  const dono = prova.cursinhoId ?? null;
  if (
    ator.editorCursinho &&
    ator.cursinhoId &&
    dono === ator.cursinhoId &&
    !provaProtegida(prova.categoria)
  )
    return true;
  if (ator.admin && dono === null) return true;
  return false;
}

export const TEXTO_OUTRO_CURSINHO =
  'Esta prova pertence a outro cursinho. Você pode ver, mas não alterar as questões dela.';
export const TEXTO_OFICIAL =
  'Esta é uma prova oficial da plataforma e não pode ser alterada.';
export const TEXTO_SEM_PERMISSAO =
  'Você não tem permissão para alterar as questões desta prova.';

/** Por que não pode — `null` quando pode. */
export function motivoParaNaoComporProva(
  prova: ProvaComDono,
  ator?: Ator,
): string | null {
  if (podeComporProva(prova, ator)) return null;
  const dono = prova.cursinhoId ?? null;
  if (dono !== null && dono !== ator?.cursinhoId) return TEXTO_OUTRO_CURSINHO;
  if (dono === null || provaProtegida(prova.categoria)) return TEXTO_OFICIAL;
  return TEXTO_SEM_PERMISSAO;
}
