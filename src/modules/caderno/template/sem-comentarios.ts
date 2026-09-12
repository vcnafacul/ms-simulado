/**
 * Remove comentários LaTeX de um texto, preservando as quebras de linha.
 *
 * ⚠️ **Três regras do lint dependem disto, e ele erra nos dois sentidos.**
 *
 * Não remover: um `\input{conteudo}` comentado passa no lint, e a prova
 * compila perfeitamente — **sem nenhuma questão**. É o caso realista: alguém
 * comenta a linha depurando no Overleaf e esquece de voltar. O `main.tex` do
 * repo já tem um `\input{preambulo}` dentro de comentário, na linha 16.
 *
 * Remover demais — ignorando o `\%` escapado — engole texto válido e produz
 * falso positivo que **bloqueia um template bom**, depois de o coordenador ter
 * visto o PDF compilar no Overleaf.
 *
 * ⚠️ As quebras de linha ficam: a pilha de `\begin`/`\end` reporta número de
 * linha, e comê-las faria toda mensagem apontar para a linha 1.
 */
export function semComentarios(texto: string): string {
  return (texto ?? '').split('\n').map(cortarComentario).join('\n');
}

/**
 * Corta a partir do primeiro `%` que não está escapado.
 *
 * A contagem é de **barras consecutivas antes do `%`**: par significa que a
 * última é ela mesma escapada (`\\` é quebra de linha), então o `%` está
 * solto e é comentário. Ímpar significa que a barra escapa o `%`.
 */
function cortarComentario(linha: string): string {
  for (let i = 0; i < linha.length; i += 1) {
    if (linha[i] !== '%') continue;

    let barras = 0;
    for (let j = i - 1; j >= 0 && linha[j] === '\\'; j -= 1) barras += 1;

    if (barras % 2 === 0) return linha.slice(0, i);
  }
  return linha;
}
