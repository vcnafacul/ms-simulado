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

  it('único em historico+cursinhoId — impede linha duplicada num reprocessamento', () => {
    const idx = indices().find(
      (i) => i.campos.historico === 1 && i.campos.cursinhoId === 1,
    );
    expect(idx).toBeDefined();
    expect(idx!.opts.unique).toBe(true);
  });
});
