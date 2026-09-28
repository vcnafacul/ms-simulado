import { HttpStatus } from '@nestjs/common';
import { Ator } from 'src/shared/ator/ator';
import { Status } from './enums/status.enum';

/**
 * Quem aprova e quem recusa uma questão do banco da comunidade (tickets/024,
 * card 03).
 *
 * - **Validador da plataforma** (`validarQuestao`): tudo, como sempre.
 * - **Validador do cursinho** (`validarQuestoesCursinho`):
 *   - **aprova qualquer questão PENDENTE** — aprovar não atrapalha ninguém;
 *   - **recusa** (ou volta a pendente) **só se não atrapalha ninguém**: a
 *     questão está só em provas do cursinho dele, ou em nenhuma. Status é
 *     global; recusar a questão da prova do B, ou de uma oficial, mexeria no
 *     trabalho de outros. Aí o caminho é tirar das próprias provas ou
 *     sinalizar para revisão (card 04).
 * - Reverter uma recusa (recusada → aprovada) é da plataforma.
 */
export type ProvaDoStatus = {
  provaId: string;
  provaNome: string;
  cursinhoId: string | null;
};

export const TEXTO_SEM_PERMISSAO_STATUS =
  'Você não tem permissão para validar questões.';
export const TEXTO_REVERTER_RECUSA =
  'Só a equipe da plataforma reverte uma questão recusada.';
export const TEXTO_USADA_POR_OUTROS =
  'Esta questão é usada em provas de outros cursinhos ou da plataforma. Você pode tirá-la das suas provas ou sinalizar para revisão.';

export type Recusa = {
  status: HttpStatus;
  message: string;
  /** As provas que impedem — o modal do client mostra (card 05). */
  provas?: ProvaDoStatus[];
};

/** `null` quando pode. */
export function recusaDoStatus(
  atual: Status,
  alvo: Status,
  provas: ProvaDoStatus[],
  ator?: Ator,
): Recusa | null {
  if (ator?.validadorProjeto) return null;
  if (!ator?.validadorCursinho) {
    return {
      status: HttpStatus.FORBIDDEN,
      message: TEXTO_SEM_PERMISSAO_STATUS,
    };
  }
  if (alvo === Status.Approved) {
    return atual === Status.Pending
      ? null
      : { status: HttpStatus.FORBIDDEN, message: TEXTO_REVERTER_RECUSA };
  }
  const deOutros = provas.filter(
    (p) => !ator.cursinhoId || (p.cursinhoId ?? null) !== ator.cursinhoId,
  );
  if (deOutros.length === 0) return null;
  return {
    status: HttpStatus.FORBIDDEN,
    message: TEXTO_USADA_POR_OUTROS,
    provas,
  };
}
