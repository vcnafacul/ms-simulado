import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';

/**
 * Os campos que a cópia NÃO herda, e por quê (card 25).
 *
 * ⚠️ Lista explícita em vez de "copia tudo menos": um campo novo no schema
 * entra na cópia por padrão, que é o comportamento certo para conteúdo e
 * classificação. O que precisa de decisão é o que fica **de fora**, e é isso que
 * está escrito aqui.
 */
export const NAO_HERDADOS = {
  /** ⚠️ Id novo, sempre. */
  _id: true,
  /**
   * ⚠️ **Estatísticas ZERADAS — é a decisão central do card.**
   *
   * Responde a *"a questão foi respondida 10 vezes, 8 acertaram, aí eu edito —
   * aquela morreu daquele jeito?"*. **Não morre:** as 10 respostas e os 8
   * acertos continuam na original, e continuam **verdadeiros**, porque
   * descrevem o conteúdo que aquelas 10 pessoas de fato leram. A cópia começa
   * em zero porque **ninguém respondeu a cópia**.
   *
   * ⚠️ Um sistema de versões faria o contrário por reflexo: a versão nova herda
   * os números da anterior, e aí "8 de 10" passaria a descrever um texto que
   * ninguém viu. A linhagem é a estrutura certa justamente porque não tem essa
   * tentação.
   */
  acertos: true,
  quantidadeResposta: true,
  quantidadeSimulado: true,
  /**
   * ⚠️ **`Pending`, nunca `Approved`.** É o que impede uma cópia não revisada
   * de entrar em prova — e a #61 já pedia isso.
   */
  status: true,
  /** ⚠️ Nasce ÓRFÃ: sem prova de origem. */
  provaBase: true,
  /** ⚠️ Não herda o avô: `origem` da cópia é sempre a questão duplicada. */
  origem: true,
} as const;

/**
 * O documento da cópia.
 *
 * ⚠️ **Herda conteúdo E classificação.** Partir de uma questão existente é o
 * ponto de duplicar — matéria, frente e enemArea vêm junto, senão a pessoa
 * reclassifica tudo à mão e o "lastro" não economiza nada.
 *
 * ⚠️ **As refs de imagem são COMPARTILHADAS, não copiadas** (`imageId`,
 * `assets`, `files`). São keys no S3/R2, e duplicar o arquivo dobraria o
 * armazenamento por uma cópia que na maioria das vezes muda só o texto.
 *
 * ⚠️ **E isso tem uma consequência que precisa estar escrita:** trocar o
 * arquivo numa key muda as DUAS questões. Enquanto o `uploadAsset` puder
 * sobrescrever uma key existente, o isolamento entre original e cópia vale para
 * o texto e **não** para a imagem. É o mesmo furo que o card 23 registrou, e a
 * regra de nunca sobrescrever key resolve os dois de uma vez.
 */
export function documentoDaCopia(original: Questao): Partial<Questao> {
  const copia: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(original)) {
    if (chave in NAO_HERDADOS) continue;
    copia[chave] = valor;
  }

  copia.status = Status.Pending;
  copia.acertos = 0;
  copia.quantidadeResposta = 0;
  copia.quantidadeSimulado = 0;
  copia.provaBase = null;
  copia.origem = String((original as { _id: unknown })._id);

  return copia as Partial<Questao>;
}
