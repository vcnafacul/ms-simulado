import { SimuladoParaCaderno } from './tipos';

/**
 * Os simulados da prova na forma que o caderno da prova precisa (tickets/038, R5).
 *
 * Um simulado de `idioma` informado é o do ENEM Dia 1 do cursinho: as questões que só existem
 * nele são as da língua (1–5). As que estão em TODOS os simulados são as comuns.
 *
 * Ordem impressa: as de cada língua (na ordem dos simulados da prova: Inglês, Espanhol), cada
 * uma com o título do bloco, e depois as comuns em ordem numérica, com o título da seção do
 * ENEM (Linguagens 06–45, Humanas 46–90; no Dia 2, Natureza 91–135 e Matemática 136–180).
 * Sem idioma (Dia 2), é o simulado único, por número.
 */
/*
 * ⚠️ Os campos são lidos UM A UM (`questao`, `numero`), e nunca com `{ ...qc }`: os simulados
 * chegam do banco como documentos do Mongoose, e espalhar um subdocumento copia o estado
 * interno dele, não os campos — `numero` sumia, toda questão era descartada como "sem número"
 * e o caderno da prova saía com "[Este simulado não tem nenhuma questão elegível…]".
 */
/**
 * As seções do caderno do ENEM (tickets/038), com a faixa de cada uma. O título é impresso
 * antes da primeira questão da seção.
 *
 * ⚠️ **Decidida só pelo NÚMERO da questão**, como no caderno do ENEM — não pela área
 * cadastrada. Se o cursinho puser uma questão de Matemática no 100, ela sai sob "Ciências da
 * Natureza": a composição da prova é responsabilidade de quem a gerencia (decisão do Fernando,
 * 2026-10-11).
 */
const SECOES_DO_ENEM: { de: number; ate: number; nome: string }[] = [
  { de: 6, ate: 45, nome: 'Linguagens, Códigos e suas Tecnologias' },
  { de: 46, ate: 90, nome: 'Ciências Humanas e suas Tecnologias' },
  { de: 91, ate: 135, nome: 'Ciências da Natureza e suas Tecnologias' },
  { de: 136, ate: 180, nome: 'Matemática e suas Tecnologias' },
];
const LINGUA_ESTRANGEIRA = { de: 1, ate: 5 };

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const faixa = (de: number, ate: number) =>
  `questões de ${doisDigitos(de)} a ${doisDigitos(ate)}`;

/** O título da seção da questão comum, pelo número; fora das faixas, sem título. */
export function secaoDoEnem(numero: number | null): string | null {
  if (numero == null) return null;
  const s = SECOES_DO_ENEM.find((x) => numero >= x.de && numero <= x.ate);
  return s ? `${s.nome} — ${faixa(s.de, s.ate)}` : null;
}

/** O título do bloco de língua estrangeira (01 a 05). */
export function secaoDaLingua(idioma: string): string {
  return `Língua estrangeira: ${idioma} — ${faixa(
    LINGUA_ESTRANGEIRA.de,
    LINGUA_ESTRANGEIRA.ate,
  )}`;
}

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
        secao: s.idioma ? secaoDaLingua(s.idioma) : null,
        anulacao: qc.anulacao,
      })),
  );
  const comuns = (simulados[0]?.questoes ?? [])
    .filter((qc) => comum(qc.questao))
    .sort(porNumero)
    .map((qc) => ({
      questao: qc.questao,
      numero: qc.numero,
      secao: secaoDoEnem(qc.numero),
      // tickets/042: lido campo a campo, como os outros (ver o ⚠️ acima).
      anulacao: qc.anulacao,
    }));

  return {
    nome: prova.nome,
    categoria: prova.categoria,
    questoes: [...daLingua, ...comuns],
  };
}
