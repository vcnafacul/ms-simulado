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
  receberNovasVersoes?: boolean | null;
};

/**
 * Categoria da plataforma ou fora de uso: a prova é oficial.
 *
 * ⚠️ `dono = Cursinho` (tickets/038, R1) **não** protege: a categoria é da
 * plataforma, mas a prova é do cursinho que a criou — vale o `cursinhoId`.
 */
export function provaProtegida(categoria?: CategoriaDaProva | null): boolean {
  return (
    (categoria?.dono ?? DONO_SYSTEM) === DONO_SYSTEM ||
    categoria?.selecionavel === false
  );
}

export function podeComporProva(prova: ProvaComDono, ator?: Ator): boolean {
  return podeComporDono(
    {
      cursinhoId: prova.cursinhoId,
      protegida: provaProtegida(prova.categoria),
    },
    ator,
  );
}

/** A regra a partir do dono já resolvido — para quem tem o resumo. */
export function podeComporDono(
  prova: { cursinhoId?: string | null; protegida: boolean },
  ator?: Ator,
): boolean {
  if (!ator) return false;
  // ⚠️ Sem o campo = prova legada = da plataforma.
  const dono = prova.cursinhoId ?? null;
  if (
    ator.editorCursinho &&
    ator.cursinhoId &&
    dono === ator.cursinhoId &&
    !prova.protegida
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

/**
 * O que a tela precisa saber de cada prova para mostrar selo e esconder
 * ações (tickets/023, card 07). ⚠️ `podeComporProva` é calculado AQUI, com o
 * ator da requisição — a tela não recalcula.
 */
export interface ResumoDoDono {
  cursinhoId: string | null;
  protegida: boolean;
  /** `false` = categoria fora de uso: área/frente1 só pelo projeto (card 17). */
  selecionavel: boolean;
  receberNovasVersoes: boolean;
  podeComporProva: boolean;
}

export function resumoDoDono(prova: ProvaComDono, ator?: Ator): ResumoDoDono {
  return {
    cursinhoId: prova.cursinhoId ?? null,
    protegida: provaProtegida(prova.categoria),
    selecionavel: prova.categoria?.selecionavel !== false,
    receberNovasVersoes: prova.receberNovasVersoes === true,
    podeComporProva: podeComporProva(prova, ator),
  };
}
