import { Status } from './enums/status.enum';

/**
 * Por que uma questão não pode ser excluída (card 33).
 *
 * ⚠️ **As condições são o card.** A exclusão em si é uma escrita; o que precisa
 * de cuidado é decidir quando ela é segura — e cada motivo abaixo protege uma
 * coisa diferente.
 */
export enum MotivoParaNaoExcluir {
  /** ⚠️ Nunca: aprovada e nunca usada é catálogo válido. */
  aprovada = 'aprovada',
  /** É o que algum histórico aponta. */
  respondida = 'respondida',
  emProva = 'em-prova',
  emSimulado = 'em-simulado',
  /** Origem de uma cópia ou de uma versão — tem rastro. */
  origemDeOutras = 'origem-de-outras',
  congelada = 'congelada',
}

export const TEXTO_DO_MOTIVO: Record<MotivoParaNaoExcluir, string> = {
  [MotivoParaNaoExcluir.aprovada]:
    'Questão aprovada não pode ser excluída — só pendente ou rejeitada.',
  [MotivoParaNaoExcluir.respondida]: 'A questão já foi respondida.',
  [MotivoParaNaoExcluir.emProva]: 'A questão está em uma prova.',
  [MotivoParaNaoExcluir.emSimulado]: 'A questão está em um simulado.',
  [MotivoParaNaoExcluir.origemDeOutras]:
    'Outras questões foram copiadas ou versionadas a partir desta.',
  [MotivoParaNaoExcluir.congelada]:
    'A questão está congelada: é a versão que quem já respondeu viu.',
};

/**
 * ⚠️ **`Pending` ou `Rejected` — e o "ou" é só aqui dentro.** É o conjunto de
 * status permitidos, uma condição. Entre as condições é sempre E.
 */
export const STATUS_EXCLUIVEIS: readonly Status[] = [
  Status.Pending,
  Status.Rejected,
];

/** O que o repositório mede, uma leitura por condição. */
export interface EstadoParaExclusao {
  status: Status;
  congelada: boolean;
  /**
   * ⚠️ **Do HISTÓRICO, não do contador `quantidadeResposta`.** O contador só é
   * confiável depois do card 21 e da execução do sync do card 22 — medido em
   * homologação antes deles: 0 de 181 questões batiam com o histórico. Uma
   * questão respondida poderia aparecer zerada e ser apagada.
   */
  respondida: boolean;
  emProva: boolean;
  emSimulado: boolean;
  /** Alguma questão tem esta como `origem` — cópia ou versão, sem distinguir. */
  temFilhas: boolean;
}

/**
 * Todos os motivos que impedem a exclusão; vazio = pode excluir.
 *
 * ⚠️ **Todos, e não o primeiro.** A recusa diz o que falhou, e parar no
 * primeiro faria a pessoa resolver um, tentar de novo e descobrir o próximo.
 */
export function motivosParaNaoExcluir(
  e: EstadoParaExclusao,
): MotivoParaNaoExcluir[] {
  const motivos: MotivoParaNaoExcluir[] = [];
  if (!STATUS_EXCLUIVEIS.includes(e.status))
    motivos.push(MotivoParaNaoExcluir.aprovada);
  if (e.respondida) motivos.push(MotivoParaNaoExcluir.respondida);
  if (e.emProva) motivos.push(MotivoParaNaoExcluir.emProva);
  if (e.emSimulado) motivos.push(MotivoParaNaoExcluir.emSimulado);
  if (e.temFilhas) motivos.push(MotivoParaNaoExcluir.origemDeOutras);
  if (e.congelada) motivos.push(MotivoParaNaoExcluir.congelada);
  return motivos;
}
