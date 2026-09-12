import { juntarAvisos } from './avisos';

const CONTEUDO_SEM_AVISO = `\\needspace{10\\baselineskip}
\\setcounter{question}{45}
\\question
Enunciado.
`;

const CONTEUDO_COM_AVISO = `% AVISO: questão 47 — alternativa C está em branco

\\needspace{10\\baselineskip}
\\setcounter{question}{45}
\\question
Enunciado.
`;

describe('juntarAvisos', () => {
  it('junta as duas listas no topo, card 02 primeiro', () => {
    const r = juntarAvisos(CONTEUDO_COM_AVISO, [
      'assets/03 — imagem não encontrada no acervo',
    ]);
    expect(r).toBe(
      `% AVISO: questão 47 — alternativa C está em branco
% AVISO: assets/03 — imagem não encontrada no acervo

\\needspace{10\\baselineskip}
\\setcounter{question}{45}
\\question
Enunciado.
`,
    );
  });

  it('cria o bloco quando só o card 03 avisou', () => {
    const r = juntarAvisos(CONTEUDO_SEM_AVISO, [
      'assets/01 — imagem grande demais',
    ]);
    expect(r.startsWith('% AVISO: assets/01 — imagem grande demais\n\n')).toBe(
      true,
    );
    expect(r).toContain('\\needspace');
  });

  it('sem aviso nenhum, não há bloco e o conteúdo não muda', () => {
    expect(juntarAvisos(CONTEUDO_SEM_AVISO, [])).toBe(CONTEUDO_SEM_AVISO);
  });

  it('preserva o bloco do card 02 quando o card 03 não avisou', () => {
    expect(juntarAvisos(CONTEUDO_COM_AVISO, [])).toBe(CONTEUDO_COM_AVISO);
  });

  it('achata quebra de linha dentro do aviso', () => {
    // ⚠️ Uma quebra de linha ENCERRA o comentário LaTeX e joga o resto do
    // aviso dentro do documento, impresso na prova do aluno.
    const r = juntarAvisos(CONTEUDO_SEM_AVISO, ['assets/01 —\nfalhou feio']);
    expect(r.split('\n').filter((l) => l.startsWith('% AVISO:'))).toHaveLength(
      1,
    );
    expect(r).toContain('% AVISO: assets/01 — falhou feio');
  });

  it('não se confunde com "% AVISO:" no meio do documento', () => {
    // Se uma questão tiver essa string no próprio texto, inserir "no topo"
    // procurando a marca acertaria o lugar errado. Por isso a operação é
    // remover o bloco de ABERTURA e prefixar, nunca inserir no meio.
    const comArmadilha = `% AVISO: questão 47 — alternativa C está em branco

\\question
O aluno leu: % AVISO: isto faz parte do enunciado
`;
    const r = juntarAvisos(comArmadilha, ['assets/01 — falhou']);
    const linhas = r.split('\n');
    expect(linhas[0]).toBe(
      '% AVISO: questão 47 — alternativa C está em branco',
    );
    expect(linhas[1]).toBe('% AVISO: assets/01 — falhou');
    expect(linhas[2]).toBe('');
    expect(r).toContain('O aluno leu: % AVISO: isto faz parte do enunciado');
  });

  it('conta os avisos das duas listas', () => {
    const { total } = juntarAvisos.comTotal(CONTEUDO_COM_AVISO, ['a', 'b']);
    expect(total).toBe(3);
  });
});
