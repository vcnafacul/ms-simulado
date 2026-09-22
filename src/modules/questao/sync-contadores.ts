/**
 * O cálculo do sync dos contadores globais da questão (card 22).
 *
 * ⚠️ **Mora em `src/`, e não em `scripts/`, para poder ser testado.** O jest
 * deste repo tem `rootDir: src` — uma lógica escrita dentro do script ficaria
 * sem teste nenhum, e é justamente a decisão de "o que escrever e o que deixar
 * quieto" que precisa estar certa: ela roda contra a coleção inteira.
 *
 * O script `scripts/sync-contadores-da-questao.ts` é só a casca: conexão,
 * flags e saída.
 */

/** O que está gravado hoje na questão. */
export interface ContadoresDaQuestao {
  quantidadeResposta: number;
  acertos: number;
  quantidadeSimulado: number;
}

export interface OperacaoDeSync {
  id: string;
  de: ContadoresDaQuestao;
  para: ContadoresDaQuestao;
}

export interface PlanoDeSync {
  operacoes: OperacaoDeSync[];
  resumo: {
    questoes: number;
    divergentes: number;
    /** Divergências ordenadas pela maior diferença absoluta em respostas. */
    maiores: OperacaoDeSync[];
  };
}

/**
 * O pipeline que reconstrói `quantidadeResposta` e `acertos` a partir dos
 * históricos.
 *
 * ⚠️ **A fonte de verdade é `historico.respostas[]`**, e cada linha carrega
 * `alternativaCorreta` — o gabarito **do momento da correção**, não o de hoje.
 * É isso que torna a reconstrução fiel: uma questão cujo gabarito mudou depois
 * continua contando os acertos pelo gabarito com que foi corrigida.
 *
 * ⚠️ **`status: { $ne: 'failed' }` inclui histórico SEM status**, e é
 * deliberado: em homologação há 42 documentos anteriores ao enum, com 2.025 das
 * 2.230 linhas de resposta. Excluí-los faria a base de uma questão antiga
 * despencar sem que nada tivesse mudado. Uma resposta respondida em 2024
 * continua sendo uma resposta.
 *
 * ⚠️ **E `failed` fica de fora explicitamente**, porque o `marcarFalha` **não
 * limpa** as `respostas` de uma leitura anterior — fato já registrado nos cards
 * 12, 13 e 15. Sem este gate, um cartão que falhou no reprocessamento
 * contribuiria com a leitura velha.
 *
 * ⚠️ Conta só quem MARCOU, a mesma regra do `updateQuestionAnswered` depois do
 * card 21. Duas regras diferentes para o mesmo campo fariam o sync "corrigir"
 * o que a escrita acabou de gravar certo, para sempre.
 */
export const PIPELINE_RESPOSTAS = [
  { $match: { status: { $ne: 'failed' }, 'respostas.0': { $exists: true } } },
  { $unwind: '$respostas' },
  {
    $match: {
      'respostas.alternativaEstudante': { $nin: [null, ''] },
    },
  },
  {
    $group: {
      _id: '$respostas.questao',
      quantidadeResposta: { $sum: 1 },
      acertos: {
        $sum: {
          $cond: [
            {
              $eq: [
                '$respostas.alternativaEstudante',
                '$respostas.alternativaCorreta',
              ],
            },
            1,
            0,
          ],
        },
      },
    },
  },
];

/**
 * O pipeline que conta em quantos simulados cada questão está.
 *
 * ⚠️ **Sobre `simulados.questoes`, e não sobre as provas.** É a coleção que o
 * `processAnswer` lê para montar a prova do aluno — é ela que define o que a
 * questão foi, de fato, para quem respondeu. Contar via prova daria outro
 * número (39 provas contra 131 simulados em homologação), e responderia outra
 * pergunta.
 *
 * ⚠️ **Substitui um contador incremental, e é por isso que o card 21 removeu o
 * `IncrementaSimulado`.** São muitos os pontos que alteram `simulados.questoes`
 * — `adicionarEmProva`, `removerDeProva`, o vínculo prova↔simulado, as
 * factories — e cada um seria uma chance de divergir de um dado que já está
 * inteiro aqui.
 */
export const PIPELINE_SIMULADOS = [
  { $unwind: '$questoes' },
  { $group: { _id: '$questoes.questao', quantidadeSimulado: { $sum: 1 } } },
];

/** Quantas divergências a saída lista em detalhe. */
export const QUANTAS_MAIORES = 10;

const ZERO: ContadoresDaQuestao = {
  quantidadeResposta: 0,
  acertos: 0,
  quantidadeSimulado: 0,
};

function igual(a: ContadoresDaQuestao, b: ContadoresDaQuestao): boolean {
  return (
    a.quantidadeResposta === b.quantidadeResposta &&
    a.acertos === b.acertos &&
    a.quantidadeSimulado === b.quantidadeSimulado
  );
}

/**
 * O que precisa ser escrito para os contadores refletirem os históricos.
 *
 * ⚠️ **Parte das questões, não dos agregados.** Uma questão com contador `5` e
 * nenhuma linha no histórico está errada, e é justamente o caso que o card
 * manda não deixar passar — iterar sobre o resultado do `$group` pularia
 * exatamente as piores. Quem não aparece nos mapas vai a **zero explícito**.
 *
 * ⚠️ **Só devolve o que diverge.** Reescrever 2.640 questões idênticas a cada
 * execução é I/O por nada, e o número de operações é a própria medida do
 * estrago — que o card 16 vai usar para decidir se a base serve.
 */
export function planoDeSync(
  atuais: Map<string, Partial<ContadoresDaQuestao>>,
  respondidas: Map<string, { quantidadeResposta: number; acertos: number }>,
  emSimulados: Map<string, number>,
): PlanoDeSync {
  const operacoes: OperacaoDeSync[] = [];

  for (const [id, gravado] of atuais) {
    /*
      ⚠️ `?? 0` em cada campo, e não um default no objeto inteiro: questão
      antiga pode ter `acertos` e não ter `quantidadeSimulado`, e um spread de
      objeto parcial deixaria `undefined` atravessar até a comparação — onde
      `undefined !== 0` marcaria como divergente uma questão que já está certa.
    */
    const de: ContadoresDaQuestao = {
      quantidadeResposta: gravado.quantidadeResposta ?? 0,
      acertos: gravado.acertos ?? 0,
      quantidadeSimulado: gravado.quantidadeSimulado ?? 0,
    };
    const r = respondidas.get(id) ?? ZERO;
    const para: ContadoresDaQuestao = {
      quantidadeResposta: r.quantidadeResposta,
      acertos: r.acertos,
      quantidadeSimulado: emSimulados.get(id) ?? 0,
    };

    if (igual(de, para)) continue;
    operacoes.push({ id, de, para });
  }

  const maiores = [...operacoes]
    .sort(
      (a, b) =>
        Math.abs(b.para.quantidadeResposta - b.de.quantidadeResposta) -
        Math.abs(a.para.quantidadeResposta - a.de.quantidadeResposta),
    )
    .slice(0, QUANTAS_MAIORES);

  return {
    operacoes,
    resumo: {
      questoes: atuais.size,
      divergentes: operacoes.length,
      maiores,
    },
  };
}

/**
 * As operações de `bulkWrite`.
 *
 * ⚠️ **`$set`, e nunca `$inc`.** É o que faz o sync ser idempotente: rodar duas
 * vezes dá o mesmo resultado. O `$inc` foi justamente o que produziu o estado
 * que este script existe para consertar.
 *
 * ⚠️ **`paraId` existe porque o `_id` precisa voltar a ser `ObjectId`.** O plano
 * trabalha com string (é a chave dos `Map`), mas o driver **nativo** não casta:
 * um filtro `{ _id: '66...' }` contra um `_id` `ObjectId` **não casa com nada** e
 * o `bulkWrite` termina sem erro, com `matchedCount: 0`. O script inteiro diria
 * "concluído" sem ter escrito uma linha.
 *
 * O padrão é identidade só para o teste poder afirmar o caminho sem montar um
 * `ObjectId`; em produção quem chama converte.
 */
export function operacoesDeEscrita(
  plano: PlanoDeSync,
  paraId: (id: string) => unknown = (id) => id,
) {
  return plano.operacoes.map((op) => ({
    updateOne: { filter: { _id: paraId(op.id) }, update: { $set: op.para } },
  }));
}
