import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { Questao } from '../questao/questao.schema';

/** Um par (matéria, frente) que a questão toca. */
export interface VinculoDaQuestao {
  materia: Materia;
  frente: Frente;
}

/**
 * ⚠️ **`frente2: ""` é o caso que a base tem de verdade.** MEDIDO em homol:
 * **125 das 1.413** questões com frente secundária guardam uma STRING VAZIA no
 * lugar do id. Ela passa por `!= null`, por `$ne: null` e por `!!f` só falha
 * porque `""` é falsy — mas basta alguém escrever `f !== null` para 125
 * questões ganharem uma frente fantasma sem nome e sem matéria.
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
