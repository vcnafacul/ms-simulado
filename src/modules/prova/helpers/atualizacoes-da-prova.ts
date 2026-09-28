import { Status } from '../../questao/enums/status.enum';
import {
  camposAlterados,
  CAMPOS_DE_CONTEUDO,
} from '../../questao/camposAlterados';
import { QuestaoDaCadeia } from '../../questao/questao.repository';

/**
 * As atualizações disponíveis de uma prova (tickets/023, card 13, regra R6).
 *
 * Numa prova com versões fixas, a questão congela quando alguém cria uma
 * versão nova. Para cada questão CONGELADA da prova, segue a cadeia de
 * sucessoras (v1 → v2 → v3) e oferece a ÚLTIMA — inclusive `Pending`:
 * bloquear pendente tira gente da revisão (decisão do Fernando).
 */
export interface Atualizacao {
  numero: number | null;
  atual: { _id: string; status: Status };
  oferta: { _id: string; status: Status; criadaEm?: Date; saltos: number };
  /**
   * A cadeia parou numa versão congelada sem sucessora viva — a seguinte foi
   * excluída. Oferece-se a última alcançável.
   */
  cadeiaInterrompida: boolean;
  camposAlterados: string[];
}

export interface FontesDaCadeia {
  questoes(ids: string[]): Promise<QuestaoDaCadeia[]>;
  /** Um nível: `origem → sucessora viva`. */
  sucessoras(ids: string[]): Promise<Map<string, QuestaoDaCadeia>>;
}

/** ⚠️ Contra ciclo por dado corrompido. Cadeias reais têm poucas versões. */
export const PROFUNDIDADE_MAXIMA = 50;

export async function atualizacoesDaProva(
  itens: { numero: number | null; questaoId: string }[],
  fontes: FontesDaCadeia,
  limite = PROFUNDIDADE_MAXIMA,
): Promise<Atualizacao[]> {
  const naProva = new Set(itens.map((i) => i.questaoId));
  const atuais = new Map(
    (await fontes.questoes([...naProva])).map((q) => [String(q._id), q]),
  );

  // Só as congeladas têm sucessora; as outras estão na ponta.
  type Cadeia = {
    item: (typeof itens)[number];
    ponta: QuestaoDaCadeia;
    saltos: number;
    visitadas: Set<string>;
    ativa: boolean;
  };
  const cadeias: Cadeia[] = itens
    .filter((i) => atuais.get(i.questaoId)?.congelada)
    .map((item) => ({
      item,
      ponta: atuais.get(item.questaoId)!,
      saltos: 0,
      visitadas: new Set([item.questaoId]),
      ativa: true,
    }));

  // ⚠️ Sem N+1: um nível da cadeia por consulta, para todas as questões juntas.
  for (let nivel = 0; nivel < limite; nivel++) {
    const ativas = cadeias.filter((c) => c.ativa);
    if (!ativas.length) break;
    const sucessoras = await fontes.sucessoras(
      ativas.map((c) => String(c.ponta._id)),
    );
    for (const c of ativas) {
      const s = sucessoras.get(String(c.ponta._id));
      if (!s || c.visitadas.has(String(s._id))) {
        c.ativa = false;
        continue;
      }
      c.visitadas.add(String(s._id));
      c.ponta = s;
      c.saltos++;
      if (!s.congelada) c.ativa = false; // chegou à ponta viva
    }
  }

  return cadeias
    .filter((c) => c.saltos > 0 && !naProva.has(String(c.ponta._id)))
    .map((c) => {
      const atual = atuais.get(c.item.questaoId)!;
      return {
        numero: c.item.numero,
        atual: { _id: String(atual._id), status: atual.status },
        oferta: {
          _id: String(c.ponta._id),
          status: c.ponta.status,
          criadaEm: c.ponta.createdAt,
          saltos: c.saltos,
        },
        // Parou numa congelada = a seguinte sumiu (excluída).
        cadeiaInterrompida: !!c.ponta.congelada,
        camposAlterados: camposAlterados(
          atual as Record<string, unknown>,
          c.ponta as Record<string, unknown>,
          CAMPOS_DE_CONTEUDO,
        ),
      };
    })
    .sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity));
}
