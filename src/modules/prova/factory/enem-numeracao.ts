/**
 * Numeração das provas ENEM 2017+ — comum à `Enem2017PlusFactory` e à
 * `EnemCursinhoFactory` (tickets/038, card 02).
 *
 * De 1 a 5 (as questões de língua estrangeira do Dia 1) cabem DUAS questões
 * por número: a de Inglês e a de Espanhol. Nos outros números, uma.
 */
type ComNumeros = { questoes: { numero: number }[] };

export const ULTIMA_IDIOMATICA = 5;

const ocorrencias = (prova: ComNumeros, numero: number) =>
  prova.questoes.filter((qc) => qc.numero === numero).length;

/** O número ainda aceita questão? */
export function numeroLivreEnem(prova: ComNumeros, numero: number): boolean {
  const limite = numero <= ULTIMA_IDIOMATICA ? 2 : 1;
  return ocorrencias(prova, numero) < limite;
}

/**
 * Os números que faltam. Dia 1: de `inicialNumero` a 90, e de 1 a 5 falta
 * enquanto não houver as duas. Dia 2: de `inicialNumero` a 180.
 */
export function numerosFaltantesEnem(
  prova: ComNumeros & { inicialNumero: number },
  dia1: boolean,
): number[] {
  const ultimo = dia1 ? 90 : 180;
  const faltantes: number[] = [];
  for (let n = prova.inicialNumero; n <= ultimo; n++) {
    const tem = ocorrencias(prova, n);
    if (tem === 0 || (dia1 && n <= ULTIMA_IDIOMATICA && tem < 2)) {
      faltantes.push(n);
    }
  }
  return faltantes;
}
