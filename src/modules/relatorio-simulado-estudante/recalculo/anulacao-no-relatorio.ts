import { estaDivergente } from '../../historico/filtro-divergente';
import { listaDeAnulados } from '../../simulado/anuladas';

/** Uma anulada do recorte, como o relatório a mostra (tickets/042, card 13). */
export interface AnuladaDoRelatorio {
  numero: number;
  motivo: string;
  justificativa: string;
}

/** O que o relatório sabe sobre anulação no recorte. */
export interface AnulacaoNoRelatorio {
  /** As anuladas de agora de cada simulado — para marcar a linha divergente (card 20). */
  numerosPorSimulado: Map<string, number[]>;
  /** As anuladas agora, por número (união dos simulados do recorte). */
  anuladas: AnuladaDoRelatorio[];
  porNumero: Map<number, AnuladaDoRelatorio>;
  /** Anuladas de cada simulado — o "total considerado" dele. */
  quantasPorSimulado: Map<string, number>;
  divergentes: number;
  /** Números que os divergentes contaram como anulados e que agora valem (card 20). */
  desanuladas: number[];
  jobAtivo: unknown | null;
}

export const SEM_ANULACAO: AnulacaoNoRelatorio = {
  numerosPorSimulado: new Map(),
  anuladas: [],
  porNumero: new Map(),
  quantasPorSimulado: new Map(),
  divergentes: 0,
  desanuladas: [],
  jobAtivo: null,
};

export function montarAnulacaoNoRelatorio(
  estado: {
    _id: unknown;
    revisaoAnulacao?: number;
    questoes?: {
      numero?: number | null;
      anulacao?: { motivo: string; justificativa: string };
    }[];
  }[],
  situacao: {
    divergentes: number;
    desanuladas?: number[];
    jobAtivo?: unknown | null;
  },
): AnulacaoNoRelatorio {
  const porNumero = new Map<number, AnuladaDoRelatorio>();
  const quantasPorSimulado = new Map<string, number>();
  const numerosPorSimulado = new Map<string, number[]>();
  for (const s of estado) {
    const id = String(s._id);
    const doSimulado = new Set<number>();
    let n = 0;
    for (const qc of s.questoes ?? []) {
      if (!qc.anulacao || qc.numero == null) continue;
      n++;
      doSimulado.add(qc.numero);
      if (!porNumero.has(qc.numero)) {
        porNumero.set(qc.numero, {
          numero: qc.numero,
          motivo: qc.anulacao.motivo,
          justificativa: qc.anulacao.justificativa,
        });
      }
    }
    quantasPorSimulado.set(id, n);
    numerosPorSimulado.set(id, listaDeAnulados(doSimulado));
  }
  return {
    numerosPorSimulado,
    anuladas: [...porNumero.values()].sort((a, b) => a.numero - b.numero),
    porNumero,
    quantasPorSimulado,
    divergentes: situacao.divergentes,
    desanuladas: situacao.desanuladas ?? [],
    jobAtivo: situacao.jobAtivo ?? null,
  };
}

/** Linha divergente: só `completed` (as outras não têm nota a defender). */
export function linhaDivergente(
  h: { status?: string; numerosAnulados?: number[] | null },
  numerosDoSimulado: number[] | undefined,
  concluida: boolean,
): boolean {
  return concluida && estaDivergente(h, numerosDoSimulado ?? []);
}
