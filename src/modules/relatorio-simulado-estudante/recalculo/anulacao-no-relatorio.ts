import { estaDivergente } from '../../historico/filtro-divergente';

/** Uma anulada do recorte, como o relatório a mostra (tickets/042, card 13). */
export interface AnuladaDoRelatorio {
  numero: number;
  motivo: string;
  justificativa: string;
}

/** O que o relatório sabe sobre anulação no recorte. */
export interface AnulacaoNoRelatorio {
  /** Revisão de cada simulado — para marcar a linha divergente (R3). */
  revisao: Map<string, number>;
  /** As anuladas agora, por número (união dos simulados do recorte). */
  anuladas: AnuladaDoRelatorio[];
  porNumero: Map<number, AnuladaDoRelatorio>;
  /** Anuladas de cada simulado — o "total considerado" dele. */
  quantasPorSimulado: Map<string, number>;
  divergentes: number;
  jobAtivo: unknown | null;
}

export const SEM_ANULACAO: AnulacaoNoRelatorio = {
  revisao: new Map(),
  anuladas: [],
  porNumero: new Map(),
  quantasPorSimulado: new Map(),
  divergentes: 0,
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
  situacao: { divergentes: number; jobAtivo?: unknown | null },
): AnulacaoNoRelatorio {
  const porNumero = new Map<number, AnuladaDoRelatorio>();
  const quantasPorSimulado = new Map<string, number>();
  const revisao = new Map<string, number>();
  for (const s of estado) {
    const id = String(s._id);
    revisao.set(id, s.revisaoAnulacao ?? 0);
    let n = 0;
    for (const qc of s.questoes ?? []) {
      if (!qc.anulacao || qc.numero == null) continue;
      n++;
      if (!porNumero.has(qc.numero)) {
        porNumero.set(qc.numero, {
          numero: qc.numero,
          motivo: qc.anulacao.motivo,
          justificativa: qc.anulacao.justificativa,
        });
      }
    }
    quantasPorSimulado.set(id, n);
  }
  return {
    revisao,
    anuladas: [...porNumero.values()].sort((a, b) => a.numero - b.numero),
    porNumero,
    quantasPorSimulado,
    divergentes: situacao.divergentes,
    jobAtivo: situacao.jobAtivo ?? null,
  };
}

/** Linha divergente: só `completed` (as outras não têm nota a defender). */
export function linhaDivergente(
  h: { status?: string; revisaoAnulacao?: number | null },
  revisaoDoSimulado: number | undefined,
  concluida: boolean,
): boolean {
  return (
    concluida && estaDivergente(h, { revisaoAnulacao: revisaoDoSimulado ?? 0 })
  );
}
