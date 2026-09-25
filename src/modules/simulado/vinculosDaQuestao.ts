import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { Questao } from '../questao/questao.schema';

/** Um par (matéria, frente) que a questão toca. */
export interface VinculoDaQuestao {
  materia: Materia;
  frente: Frente;
}

/**
 * Uma frente só vale se chegou POPULADA — objeto com `_id`.
 *
 * ⚠️ **As quatro formas que o campo assume na base foram MEDIDAS em homol**, e
 * o que o Mongoose entrega em cada uma foi verificado com o populate real:
 *
 * | no banco                  | quantas | chega como   |
 * |---------------------------|---------|--------------|
 * | id como **string**        | 1.288   | **populada** |
 * | `null`                    | 2.633   | `null`       |
 * | string **vazia** `""`     | 125     | `undefined`  |
 * | campo **ausente**         | 7       | `undefined`  |
 *
 * ⚠️ **Os ids estão gravados como STRING, não ObjectId** — `objectId: 0` em
 * toda a coleção. O Mongoose faz o cast porque o schema declara
 * `type: Types.ObjectId`, e por isso o populate funciona. Se o schema perder
 * esse tipo, o populate para de resolver e o campo chega como string crua —
 * que é justamente o que este teste de FORMA rejeita, em vez de deixar passar
 * um "objeto" que é só o id.
 *
 * ⚠️ **Correção (contagem-por-materia 04): o `""` NÃO chega como
 * `undefined`.** Medido com Mongo real: o `populate` do
 * `SimuladoRepository.answer` monta um `$in` com o `""` e estoura `CastError`
 * — a consulta inteira falha antes de chegar aqui, e o `processAnswer` falhava
 * para todo cartão do simulado. O schema da questão agora converte `""` em
 * `null` na escrita (`vazioViraNull`), e `scripts/limpar-referencias-vazias.ts`
 * limpa o passado. A guarda abaixo continua valendo para `lean()` e driver cru.
 */
function frenteValida(f: unknown): f is Frente {
  return typeof f === 'object' && f !== null && (f as Frente)._id !== undefined;
}

/**
 * Todos os pares (matéria, frente) que uma questão toca.
 *
 * ⚠️ **Questão interdisciplinar conta INTEIRA em cada frente, e em cada
 * matéria.** Decisão de produto, tomada com a base na mão: 928 das 1.616
 * frentes secundárias de homol são de **outra** matéria, e os pares mais comuns
 * são interdisciplinaridades reconhecíveis — História→Sociologia (97),
 * Língua Estrangeira→Língua Portuguesa (83), Química→Biologia (23). O modelo
 * está sendo usado como foi desenhado; o cálculo é que ignorava.
 *
 * ⚠️ **Peso inteiro, não fracionado.** Cada número passa a ser "% de acerto nas
 * questões que TOCAM esta frente", que é como o coordenador pensa. Meia questão
 * de Estatística não quer dizer nada para ninguém.
 *
 * ⚠️ **Consequência que TEM de aparecer na tela:** as bases deixam de somar o
 * total do simulado. Uma prova de 10 questões pode ter 13 vínculos. Por isso a
 * base anda junto do percentual nas telas que consomem isto — mesmo padrão do
 * `formatarDificuldade`. Sem a base, parece erro.
 *
 * ⚠️ **A matéria vem da FRENTE, não da questão.** Uma frente de Sociologia
 * numa questão de História mora sob Sociologia: pô-la sob História faria o
 * drill-down mostrar "História › Sociologia", que é falso. É isto que torna
 * impossível consertar a frente sem decidir a matéria — em 53% dos casos
 * multi-frente as duas decisões são a mesma.
 *
 * ⚠️ **Sem duplicar o mesmo par.** Se `frente1` e `frente2` forem a mesma
 * frente (dado sujo), a questão contaria duas vezes na mesma conta.
 *
 * ⚠️ **Questão sem frente nenhuma devolve `[]`, e NÃO estoura.** São 2 questões
 * reais em homol com `frente1: null` — e o cálculo ANTIGO fazia
 * `res.frente._id.toString()` nelas, um `TypeError` que derrubava o
 * `processAnswer` inteiro e marcava o cartão como `erro_no_processamento`.
 * Aqui elas só ficam fora do drill-down; o `geral` continua contando.
 */
export function vinculosDaQuestao(questao: Questao): VinculoDaQuestao[] {
  const candidatas = [questao.frente1, questao.frente2, questao.frente3];
  const vistos = new Set<string>();
  const vinculos: VinculoDaQuestao[] = [];

  for (const frente of candidatas) {
    if (!frenteValida(frente)) continue;

    /*
      ⚠️ `frente.materia` só existe se a consulta populou a matéria DENTRO da
      frente. Sem isso, cai para a matéria da questão — que é o comportamento
      antigo, e é melhor do que descartar o vínculo em silêncio.
    */
    const materia = (frente.materia as Materia) ?? questao.materia;
    if (materia === undefined || materia === null) continue;

    const chave = `${String(materia._id)}|${String(frente._id)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    vinculos.push({ materia, frente });
  }

  return vinculos;
}
