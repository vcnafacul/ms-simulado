import { RelatorioSimuladoEstudanteSchema } from './relatorio-simulado-estudante.schema';

describe('RelatorioSimuladoEstudante schema', () => {
  it('tem os cinco campos do contrato', () => {
    for (const path of [
      'historico',
      'simulado',
      'usuario',
      'cursinhoId',
      'turmaId',
    ]) {
      expect(RelatorioSimuladoEstudanteSchema.path(path)).toBeDefined();
    }
  });

  it('turmaId é opcional — estudante sem turma ainda gera linha', () => {
    expect(
      RelatorioSimuladoEstudanteSchema.path('turmaId').isRequired,
    ).toBeFalsy();
    expect(RelatorioSimuladoEstudanteSchema.path('cursinhoId').isRequired).toBe(
      true,
    );
  });

  const indices = () =>
    RelatorioSimuladoEstudanteSchema.indexes().map(([campos, opts]) => ({
      campos: campos as Record<string, unknown>,
      opts: (opts ?? {}) as Record<string, unknown>,
    }));

  it('indexa os dois recortes do relatório', () => {
    const chaves = indices().map((i) => JSON.stringify(i.campos));
    expect(chaves).toContain(JSON.stringify({ simulado: 1, cursinhoId: 1 }));
    expect(chaves).toContain(JSON.stringify({ simulado: 1, turmaId: 1 }));
  });

  it('indexa o recorte SEM simulado no prefixo — é o da lista de simulados', () => {
    // A consulta do card 04b agrupa POR simulado, filtrando só por `cursinhoId`
    // (e talvez `turmaId`). Os dois índices acima começam por `simulado`, e
    // prefixo de índice composto não serve a quem não filtra o prefixo: seria
    // varredura de coleção — invisível numa coleção nova e pequena, cara
    // depois.
    const chaves = indices().map((i) => JSON.stringify(i.campos));

    expect(chaves).toContain(JSON.stringify({ cursinhoId: 1, turmaId: 1 }));
  });

  it('único em simulado+cursinhoId+usuario — um estudante, uma linha', () => {
    // O grão do relatório é o estudante, não a tentativa: reenviar depois de uma
    // falha cria um Historico novo, e sem esta chave nasceria uma segunda linha.
    const idx = indices().find(
      (i) =>
        i.campos.simulado === 1 &&
        i.campos.cursinhoId === 1 &&
        i.campos.usuario === 1,
    );
    expect(idx).toBeDefined();
    expect(idx!.opts.unique).toBe(true);
  });
});
