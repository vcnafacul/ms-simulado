import { Status } from './enums/status.enum';
import { TipoOrigem } from './enums/tipo-origem.enum';

/** O mínimo de uma questão para desenhar a linhagem (card 34A). */
export interface NoDaLinhagem {
  _id: string;
  status: Status;
  congelada?: boolean;
  origem?: string | null;
  tipoOrigem?: TipoOrigem | null;
  textoQuestao?: string;
}

/** Uma linha da aba Linhagem: o que identifica a questão para quem olha. */
export interface ItemDaLinhagem {
  id: string;
  status: Status;
  congelada: boolean;
  enunciado: string;
  /** Em quantas provas está — cópia que virou questão de prova é outra história. */
  provas: number;
}

export interface LinhagemDaQuestao {
  atual: string;
  /**
   * A cadeia de versões, da mais antiga à mais nova, **com a atual dentro**.
   * Vazia quando a questão nunca foi versionada.
   */
  versoes: ItemDaLinhagem[];
  /** As cópias DIRETAS — a cópia de uma cópia aparece na aba da cópia. */
  copias: ItemDaLinhagem[];
  /** De quem esta questão é cópia, se for. */
  origemCopia: ItemDaLinhagem | null;
}

/**
 * ⚠️ **Teto de segurança, não expectativa.** Uma cadeia real tem poucas
 * versões; o teto existe para que um dado corrompido não vire um laço de
 * consultas sem fim.
 */
const MAX_VERSOES = 50;

/**
 * A cadeia de versões que passa por `atual`, da mais antiga à mais nova.
 *
 * ⚠️ **Só vínculos `versao`.** Cópia é irmã, não elo; e `origem` sem tipo é
 * cópia (dado anterior ao card 32).
 *
 * ⚠️ **Uma consulta por elo**, subindo e descendo. `$graphLookup` não serve:
 * `origem` é string e `_id` é ObjectId, e ele só casa tipos iguais. Com
 * cadeias de poucas versões, o laço é mais barato que converter o campo.
 *
 * ⚠️ **Para baixo, no máximo UMA sucessora por elo** — a original congela ao
 * versionar, e questão congelada recusa nova versão.
 */
export async function cadeiaDeVersoes(
  atual: NoDaLinhagem,
  buscarNo: (id: string) => Promise<NoDaLinhagem | null>,
  buscarSucessora: (id: string) => Promise<NoDaLinhagem | null>,
): Promise<NoDaLinhagem[]> {
  const vistos = new Set<string>([String(atual._id)]);

  const antes: NoDaLinhagem[] = [];
  let cur = atual;
  while (
    cur.tipoOrigem === TipoOrigem.versao &&
    cur.origem &&
    !vistos.has(cur.origem) &&
    antes.length < MAX_VERSOES
  ) {
    const pai = await buscarNo(cur.origem);
    if (!pai) break;
    vistos.add(String(pai._id));
    antes.unshift(pai);
    cur = pai;
  }

  const depois: NoDaLinhagem[] = [];
  cur = atual;
  while (depois.length < MAX_VERSOES) {
    const filha = await buscarSucessora(String(cur._id));
    if (!filha || vistos.has(String(filha._id))) break;
    vistos.add(String(filha._id));
    depois.push(filha);
    cur = filha;
  }

  return [...antes, atual, ...depois];
}

const TAMANHO_DO_RESUMO = 120;

/**
 * O começo do enunciado, numa linha.
 *
 * ⚠️ **Truncado no servidor**: uma questão com muitas cópias mandaria todos os
 * enunciados inteiros para uma lista que mostra uma linha de cada.
 */
export function resumoDoEnunciado(texto: string | undefined): string {
  const linha = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (linha.length <= TAMANHO_DO_RESUMO) return linha;
  return `${linha.slice(0, TAMANHO_DO_RESUMO).trimEnd()}…`;
}
