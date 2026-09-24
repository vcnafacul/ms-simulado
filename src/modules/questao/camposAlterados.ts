/**
 * Quais campos de uma edição mudaram de fato.
 *
 * ⚠️ **Existe para MEDIR, e não para auditar** (card 24). A série de linhagem
 * (`25`–`29`) precisa saber com que frequência uma questão é editada **depois**
 * de entrar em simulado aplicado — e ninguém sabe, porque não há registro:
 * medido em homologação, os 380 registros de `Questao` no `auditlogs` são
 * TODOS mudança de `status`, e o `updateContent` não grava log nenhum.
 *
 * ⚠️ **Construir versionamento antes desse número é o erro que o card 16 quase
 * cometeu** — ele ia exibir uma coluna de dificuldade global sem auditar os
 * contadores, e a auditoria mostrou que 0 de 181 questões batiam com o
 * histórico.
 */

/**
 * Os nomes dos campos que mudaram, em ordem estável.
 *
 * ⚠️ **Só compara o que o payload TRAZ.** Campo ausente é "não mexer", e
 * tratá-lo como mudança para `undefined` marcaria toda edição parcial como
 * alteração de tudo — inflando exatamente o número que este card existe para
 * medir.
 *
 * ⚠️ **Comparação frouxa entre `null` e `undefined` de propósito.** O Mongo
 * grava campo ausente e `null` de formas diferentes (medido no card 14), e uma
 * questão legada sem `pergunta` recebendo `pergunta: null` não é edição — é o
 * mesmo vazio escrito de outro jeito.
 */
export function camposAlterados(
  atual: Record<string, unknown>,
  novo: Record<string, unknown>,
  /*
    ⚠️ `readonly string[]`, e não `keyof typeof novo`: o payload de uma edição
    parcial não tem todos os campos, e amarrar a lista ao objeto recebido faria
    o compilador recusar exatamente o caso que esta função existe para tratar.
  */
  campos: readonly string[],
): string[] {
  return campos.filter((campo) => {
    if (!(campo in novo)) return false;
    const antes = atual[campo];
    const depois = novo[campo];
    // ⚠️ `== null` cobre os dois vazios — ver o docblock.
    if (antes == null && depois == null) return false;
    return antes !== depois;
  });
}

/** Os campos de conteúdo que o `updateContent` escreve. */
export const CAMPOS_DE_CONTEUDO = [
  'textoQuestao',
  'pergunta',
  'textoAlternativaA',
  'textoAlternativaB',
  'textoAlternativaC',
  'textoAlternativaD',
  'textoAlternativaE',
  /*
    ⚠️ **O gabarito entra na lista de conteúdo**, e é o campo mais importante
    dela: trocar `alternativa` muda quem acertou. O card 28 (recorreção) nasce
    justamente daí — e este log é o que vai dizer com que frequência acontece.
  */
  'alternativa',
  'contentFormat',
] as const;

/** Os campos de classificação que o `updateClassificacao` escreve. */
export const CAMPOS_DE_CLASSIFICACAO = [
  'enemArea',
  'materia',
  'frente1',
  'frente2',
  'frente3',
] as const;

/**
 * O que vai no `changes` do log.
 *
 * ⚠️ **Os NOMES dos campos, nunca o conteúdo.** Gravar o texto antigo aqui
 * seria versionamento pela porta dos fundos — com todas as decisões do card 26
 * tomadas por omissão, e nenhuma delas discutida. Este card mede; quem guarda é
 * o 26.
 *
 * ⚠️ **`respondida` é o campo que responde a pergunta.** Editar questão que
 * ninguém respondeu é inofensivo — é rascunho. O que interessa é quantas
 * edições atingem questão **já respondida**.
 */
export function registroDaEdicao(
  acao: string,
  campos: string[],
  quantidadeResposta: number | undefined,
): string {
  return JSON.stringify({
    acao,
    campos,
    respondida: (quantidadeResposta ?? 0) > 0,
  });
}
