import { SimuladoParaCaderno } from './tipos';

/**
 * Os simulados da prova na forma que o caderno da prova precisa (tickets/038, R5).
 *
 * Um simulado de `idioma` informado é o do ENEM Dia 1 do cursinho: as questões que só existem
 * nele são as da língua (1–5). As que estão em TODOS os simulados são as comuns.
 *
 * Ordem impressa: as de cada língua (na ordem dos simulados da prova: Inglês, Espanhol), cada
 * uma com o título do bloco, e depois as comuns — 1–5 Inglês, 1–5 Espanhol, 6–90, como no
 * caderno do ENEM. Sem idioma (Dia 2), é o simulado único, por número.
 */
/*
 * ⚠️ Os campos são lidos UM A UM (`questao`, `numero`), e nunca com `{ ...qc }`: os simulados
 * chegam do banco como documentos do Mongoose, e espalhar um subdocumento copia o estado
 * interno dele, não os campos — `numero` sumia, toda questão era descartada como "sem número"
 * e o caderno da prova saía com "[Este simulado não tem nenhuma questão elegível…]".
 */
export interface SimuladoDaProva {
  idioma?: string | null;
  questoes: SimuladoParaCaderno['questoes'];
}

export function montarCadernoDaProva(
  prova: { nome: string; categoria: SimuladoParaCaderno['categoria'] },
  simulados: SimuladoDaProva[],
): SimuladoParaCaderno {
  const idDe = (q: unknown) => String((q as { _id?: unknown })?._id ?? q ?? '');
  const quantos = new Map<string, number>();
  for (const s of simulados) {
    for (const qc of s.questoes) {
      const id = idDe(qc.questao);
      quantos.set(id, (quantos.get(id) ?? 0) + 1);
    }
  }
  const comum = (q: unknown) =>
    simulados.length === 1 || quantos.get(idDe(q)) === simulados.length;

  const porNumero = (
    a: { numero: number | null },
    b: { numero: number | null },
  ) => (a.numero ?? Infinity) - (b.numero ?? Infinity);

  const daLingua = simulados.flatMap((s) =>
    s.questoes
      .filter((qc) => !comum(qc.questao))
      .sort(porNumero)
      .map((qc) => ({
        questao: qc.questao,
        numero: qc.numero,
        secao: s.idioma ? `Língua estrangeira — ${s.idioma}` : null,
      })),
  );
  const comuns = (simulados[0]?.questoes ?? [])
    .filter((qc) => comum(qc.questao))
    .sort(porNumero)
    .map((qc) => ({ questao: qc.questao, numero: qc.numero, secao: null }));

  return {
    nome: prova.nome,
    categoria: prova.categoria,
    questoes: [...daLingua, ...comuns],
  };
}
