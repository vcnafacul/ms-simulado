import { BadRequestException } from '@nestjs/common';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';

/** O mínimo de uma prova para decidir se ela aceita uma área. */
export interface ProvaComAreas {
  nome: string;
  enemAreas?: string[] | null;
}

/**
 * A prova restringe área? Só a ENEM: as fábricas ENEM gravam as áreas do dia
 * em `enemAreas`, e a customizada grava `[]`.
 */
const restringe = (prova: ProvaComAreas) => (prova.enemAreas ?? []).length > 0;

const aceita = (prova: ProvaComAreas, area: EnemArea | string) =>
  !restringe(prova) || prova.enemAreas!.includes(area);

/**
 * A área da questão tem de caber na prova (card 01 de `area-enem-da-questao`).
 *
 * ⚠️ **Sem isto, a questão entra no lugar errado EM SILÊNCIO.** As fábricas
 * ENEM escolhem os simulados por `simulado.nome.includes(enemArea)`, e nenhum
 * simulado do Dia 2 tem "Linguagens" no nome: uma questão de Linguagens na
 * ENEM Dia 2 ficava fora do simulado da área (2017+) ou de simulado nenhum
 * (2010–2016, modo por dia).
 *
 * ⚠️ **Chamar ANTES de qualquer escrita** — recusar depois de criar a questão
 * ou de abrir a transação deixaria órfã ou vínculo pela metade.
 *
 * ⚠️ **Função pura, e não método do `EnemService`**: é regra da prova, sem
 * dependência nenhuma, e as fábricas a chamam direto. Prova sem `enemAreas`
 * (customizada) aceita qualquer área, sem caso especial.
 */
export function validarAreaNaProva(
  prova: ProvaComAreas,
  enemArea: EnemArea | string,
): void {
  if (aceita(prova, enemArea)) return;
  throw new BadRequestException(
    `Questão de ${enemArea} não é permitida na prova ${prova.nome}. ` +
      `Esta prova aceita: ${prova.enemAreas!.join(', ')}.`,
  );
}

/**
 * As provas que NÃO aceitam a área — para a mudança de área de uma questão
 * que já está em várias provas.
 */
export function provasQueRecusamArea<P extends ProvaComAreas>(
  provas: P[],
  enemArea: EnemArea | string,
): P[] {
  return provas.filter((p) => !aceita(p, enemArea));
}
