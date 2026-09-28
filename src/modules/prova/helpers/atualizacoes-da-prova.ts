import { Status } from '../../questao/enums/status.enum';
import {
  camposAlterados,
  CAMPOS_DE_CONTEUDO,
} from '../../questao/camposAlterados';
import { QuestaoDaCadeia } from '../../questao/questao.repository';

/**
 * As atualizações disponíveis de uma prova (tickets/023, card 13, regra R6).
 *
 * Numa prova com versões fixas, a questão fica na versão em que foi montada
 * quando alguém cria uma nova. Para cada questão da prova que JÁ TEVE
 * sucessora, segue a cadeia (v1 → v2 → v3) e oferece a ÚLTIMA — inclusive
 * `Pending`: bloquear pendente tira gente da revisão (decisão do Fernando).
 *
 * ⚠️ `teveSucessora`, e não `congelada` (card 19): desde o card 18 a original
 * que segue numa prova com versões fixas não congela. `congelada` entra junto
 * só como rede para dado anterior à migração 0005.
 */
export interface Atualizacao {
  numero: number | null;
  atual: { _id: string; status: Status };
  oferta: { _id: string; status: Status; criadaEm?: Date; saltos: number };
  /**
   * A cadeia parou numa versão que teve sucessora, mas ela não está mais viva
   * — foi excluída. Oferece-se a última alcançável.
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

const jaTeveSucessora = (q?: QuestaoDaCadeia) =>
  !!(q?.teveSucessora || q?.congelada);

export async function atualizacoesDaProva(
  itens: { numero: number | null; questaoId: string }[],
  fontes: FontesDaCadeia,
  limite = PROFUNDIDADE_MAXIMA,
): Promise<Atualizacao[]> {
  const naProva = new Set(itens.map((i) => i.questaoId));
  const atuais = new Map(
    (await fontes.questoes([...naProva])).map((q) => [String(q._id), q]),
  );

  // Só quem teve sucessora tem para onde ir; as outras estão na ponta.
  type Cadeia = {
    item: (typeof itens)[number];
    ponta: QuestaoDaCadeia;
    saltos: number;
    visitadas: Set<string>;
    ativa: boolean;
  };
  const cadeias: Cadeia[] = itens
    .filter((i) => jaTeveSucessora(atuais.get(i.questaoId)))
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
      if (!jaTeveSucessora(s)) c.ativa = false; // chegou à ponta viva
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
        // Parou numa que teve sucessora = a seguinte sumiu (excluída).
        cadeiaInterrompida: jaTeveSucessora(c.ponta),
        camposAlterados: camposAlterados(
          atual as Record<string, unknown>,
          c.ponta as Record<string, unknown>,
          CAMPOS_DE_CONTEUDO,
        ),
      };
    })
    .sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity));
}
