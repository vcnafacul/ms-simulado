import { semComentarios } from './sem-comentarios';

describe('semComentarios — o que precisa sumir', () => {
  it('tira o comentário de linha inteira', () => {
    expect(semComentarios('% um comentário\n\\documentclass{exam}')).toBe(
      '\n\\documentclass{exam}',
    );
  });

  it('tira o comentário no fim da linha, preservando o código', () => {
    expect(semComentarios('\\input{preambulo} % carrega os pacotes')).toBe(
      '\\input{preambulo} ',
    );
  });

  it('o caso que motiva esta peça: comando dentro de comentário não conta', () => {
    // ⚠️ O `main.tex` de hoje TEM isto, na linha 16. Um `includes` ingênuo
    // conta duas ocorrências de `\input{preambulo}` e não distingue a real.
    //
    // E o caso perigoso é o inverso: alguém comenta `\input{conteudo}`
    // depurando no Overleaf e esquece. O lint passa, e a prova compila
    // perfeitamente — sem nenhuma questão.
    const texto = [
      '% \\input{preambulo} e \\includegraphics resolvem relativo a este',
      '\\input{preambulo}',
      '% \\input{conteudo}',
    ].join('\n');
    const limpo = semComentarios(texto);
    expect(limpo).toContain('\\input{preambulo}');
    expect(limpo).not.toContain('\\input{conteudo}');
  });
});

describe('semComentarios — o que NÃO pode sumir', () => {
  it('`\\%` escapado não inicia comentário', () => {
    // ⚠️ O outro sentido do erro. Engolir daqui em diante produz falso
    // positivo no lint, e o coordenador não consegue publicar um template
    // que ele acabou de ver compilar no Overleaf.
    expect(semComentarios('100\\% dos casos \\& mais')).toBe(
      '100\\% dos casos \\& mais',
    );
  });

  it('`\\%` seguido de um comentário de verdade na mesma linha', () => {
    expect(semComentarios('\\def\\x{50\\%} % a taxa')).toBe('\\def\\x{50\\%} ');
  });

  it('`\\\\%` — barra escapada, então o % É comentário', () => {
    // `\\` é quebra de linha; o `%` depois dela está solto.
    expect(semComentarios('a \\\\% comentário')).toBe('a \\\\');
  });

  it('preserva as quebras de linha', () => {
    // A pilha de `\begin`/`\end` reporta número de linha; comer as quebras
    // faria toda mensagem de erro apontar para a linha 1.
    expect(semComentarios('a\n% x\nb').split('\n')).toHaveLength(3);
  });

  it('texto sem % nenhum atravessa igual', () => {
    expect(semComentarios('\\documentclass{exam}')).toBe(
      '\\documentclass{exam}',
    );
  });

  it('string vazia devolve vazia', () => {
    expect(semComentarios('')).toBe('');
  });
});
