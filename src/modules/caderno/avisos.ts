/**
 * Junta os avisos dos dois cards no topo do `conteudo.tex`.
 *
 * ⚠️ **Por que isto existe:** o bloco `% AVISO:` é escrito pelo card 02, que
 * roda **antes** da resolução das imagens. Os avisos do card 03 — imagem não
 * encontrada, endereço recusado, formato não suportado — saem no retorno do
 * resolvedor e, sem esta função, não seriam escritos em lugar nenhum.
 *
 * O `LEIA-ME.txt` já promete essas linhas, e já explica que uma caixa cinza no
 * lugar da figura tem o motivo numa delas. A promessa está publicada; isto é a
 * entrega.
 */

export const MARCA = '% AVISO: ';

/**
 * ⚠️ Quebra de linha dentro de um aviso **encerra o comentário** e joga o resto
 * dentro do documento, impresso na prova.
 *
 * Mora aqui, e não no gerador, porque é regra sobre AVISO — e o gerador (card
 * 02) e este módulo (card 04) escrevem os mesmos comentários. Duas cópias da
 * mesma regra é como elas divergem, e o defeito da divergência é texto de
 * aviso impresso no meio da prova do aluno.
 */
export const umaLinhaSo = (texto: string): string =>
  texto.replace(/[\r\n]+/g, ' ').trim();

/**
 * Separa o bloco de abertura do resto.
 *
 * ⚠️ **Remove e reescreve, nunca insere no meio.** Se uma questão contiver a
 * string `% AVISO:` no próprio texto, procurar a marca para inserir "no topo"
 * acertaria o lugar errado — e o aviso sairia impresso no meio da prova.
 */
function separar(conteudo: string): { avisos: string[]; corpo: string } {
  const linhas = conteudo.split('\n');
  const avisos: string[] = [];

  let i = 0;
  while (i < linhas.length && linhas[i].startsWith(MARCA)) {
    avisos.push(linhas[i].slice(MARCA.length));
    i += 1;
  }

  // A linha em branco que fecha o bloco também sai: ela é reposta ao remontar.
  if (avisos.length && linhas[i] === '') i += 1;

  return { avisos, corpo: linhas.slice(i).join('\n') };
}

function montar(todos: string[], corpo: string): string {
  if (!todos.length) return corpo;
  const bloco = todos.map((a) => `${MARCA}${umaLinhaSo(a)}`).join('\n');
  return `${bloco}\n\n${corpo}`;
}

export function juntarAvisos(
  conteudo: string,
  avisosDasImagens: string[],
): string {
  const { avisos, corpo } = separar(conteudo);
  return montar([...avisos, ...avisosDasImagens], corpo);
}

/** O mesmo, mais o total — que vai no header `X-Caderno-Avisos`. */
juntarAvisos.comTotal = (
  conteudo: string,
  avisosDasImagens: string[],
): { conteudo: string; total: number } => {
  const { avisos, corpo } = separar(conteudo);
  const todos = [...avisos, ...avisosDasImagens];
  return { conteudo: montar(todos, corpo), total: todos.length };
};
