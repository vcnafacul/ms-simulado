import { Simulado } from '../schemas/simulado.schema';

/**
 * Fonte única de verdade sobre "esse simulado está disponível agora?".
 * Combina o gate existente `bloqueado` com a janela temporal opcional
 * (`disponivelDe` / `disponivelAte`). Funções puras, sem acesso a banco.
 */
export type AvailabilityStatus =
  | 'disponivel' // bloqueado=false + dentro da janela (ou sem janela)
  | 'bloqueado' // questões pendentes
  | 'antes_da_janela' // bloqueado=false, mas now < disponivelDe
  | 'depois_da_janela'; // bloqueado=false, mas now > disponivelAte

type AvailabilityInput = Pick<
  Simulado,
  'bloqueado' | 'disponivelDe' | 'disponivelAte'
>;

export function isSimuladoAvailable(
  s: AvailabilityInput,
  now: Date = new Date(),
): boolean {
  if (s.bloqueado) return false;
  if (s.disponivelDe && now < s.disponivelDe) return false;
  if (s.disponivelAte && now > s.disponivelAte) return false;
  return true;
}

export function getAvailabilityStatus(
  s: AvailabilityInput,
  now: Date = new Date(),
): AvailabilityStatus {
  if (s.bloqueado) return 'bloqueado';
  if (s.disponivelDe && now < s.disponivelDe) return 'antes_da_janela';
  if (s.disponivelAte && now > s.disponivelAte) return 'depois_da_janela';
  return 'disponivel';
}
