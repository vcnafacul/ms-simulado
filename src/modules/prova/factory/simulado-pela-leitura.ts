import { Idioma } from 'src/modules/simulado/enums/idioma.enum';

/**
 * O simulado do cartão DA PROVA, a partir do que o OMR leu (tickets/038, R8).
 *
 * Regra do ENEM Dia 1 do cursinho: marcou Espanhol → simulado Espanhol; marcou Inglês, não
 * marcou nada ou marcou os dois → simulado **Inglês** (padrão decidido). Prova com um simulado
 * só (Dia 2) → ele, sem olhar o cartão.
 *
 * Mora junto das fábricas porque é regra da CATEGORIA: outra categoria pode ter outra regra
 * depois. Devolve `null` quando a prova não tem como decidir (ex.: dois simulados sem idioma)
 * — quem chama marca a leitura como falha.
 *
 * @param idiomaLido o campo `idioma` cru do ms-omr: "ING", "ESP", "" ou "INGESP".
 */
export function simuladoPelaLeitura(
  simulados: { id: string; idioma?: string | null }[],
  idiomaLido?: string | null,
): string | null {
  if (simulados.length === 1) return simulados[0].id;
  const de = (idioma: Idioma) =>
    simulados.find((s) => s.idioma === idioma)?.id ?? null;
  if (idiomaLido === 'ESP') return de(Idioma.Espanhol);
  return de(Idioma.Ingles);
}
