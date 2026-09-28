import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Quem está agindo (tickets/023, card 02/03). Montado pela api a partir do
 * JWT e enviado no header `x-ator`, em JSON — o cliente não fala com o ms.
 */
export type Ator = {
  userId: string;
  /** Cursinho em que colabora (ativo), ou `null`. */
  cursinhoId: string | null;
  /** `criarQuestao || validarQuestao` — do projeto. */
  admin: boolean;
  /** `editarQuestoesCursinho`. */
  editorCursinho: boolean;
  /** `validarQuestao` — valida como a plataforma (tickets/024). */
  validadorProjeto?: boolean;
  /** `validarQuestoesCursinho` — aprova pendente; recusa com regra (024). */
  validadorCursinho?: boolean;
};

export const HEADER_ATOR = 'x-ator';

/**
 * O ator do header, ou `undefined` se ausente ou malformado.
 *
 * ⚠️ Nunca um ator "padrão": quem decide recusa sem ator (card 03). E o
 * corpo nunca é lido — um `ator` no corpo é ignorado.
 */
export function lerAtor(header: unknown): Ator | undefined {
  if (typeof header !== 'string' || !header) return undefined;
  let bruto: unknown;
  try {
    bruto = JSON.parse(header);
  } catch {
    return undefined;
  }
  if (!bruto || typeof bruto !== 'object') return undefined;
  const a = bruto as Record<string, unknown>;
  if (typeof a.userId !== 'string' || !a.userId) return undefined;
  if (a.cursinhoId !== null && typeof a.cursinhoId !== 'string')
    return undefined;
  if (typeof a.admin !== 'boolean' || typeof a.editorCursinho !== 'boolean')
    return undefined;
  return {
    userId: a.userId,
    cursinhoId: (a.cursinhoId as string | null) || null,
    admin: a.admin,
    editorCursinho: a.editorCursinho,
    // Opcionais (tickets/024): ausente = false — nunca um validador por omissão.
    validadorProjeto: a.validadorProjeto === true,
    validadorCursinho: a.validadorCursinho === true,
  };
}

/** `@AtorDaRequisicao() ator?: Ator` — lê o header `x-ator`. */
export const AtorDaRequisicao = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Ator | undefined =>
    lerAtor(ctx.switchToHttp().getRequest().headers?.[HEADER_ATOR]),
);
