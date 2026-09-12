import { CadernoTemplateSchema } from './caderno-template.schema';

const indices = () => CadernoTemplateSchema.indexes();

describe('CadernoTemplate schema', () => {
  it('tem os campos do card', () => {
    for (const campo of [
      'versao',
      'status',
      'arquivos',
      'criadorId',
      'publicadaEm',
      'notas',
      'origemVersao',
    ]) {
      expect(CadernoTemplateSchema.path(campo)).toBeDefined();
    }
  });

  it('status só aceita os três estados', () => {
    const enumerado = (CadernoTemplateSchema.path('status') as any)
      .enumValues as string[];
    expect([...enumerado].sort()).toEqual([
      'arquivada',
      'publicada',
      'rascunho',
    ]);
  });

  it('versao é única', () => {
    const idx = indices().find(
      ([campos]) => (campos as Record<string, unknown>).versao === 1,
    );
    expect(idx).toBeDefined();
    expect((idx![1] as Record<string, unknown>).unique).toBe(true);
  });

  it('ÍNDICE PARCIAL: no máximo um rascunho', () => {
    // ⚠️ É a única coisa que garante um rascunho por vez. Declarado sem o
    // partialFilterExpression, ele tornaria `status` único no mundo — uma
    // única versão arquivada no banco inteiro — e o erro só apareceria na
    // segunda escrita, em produção.
    const parciais = indices().filter(
      ([, opts]) => (opts as Record<string, unknown>).partialFilterExpression,
    );
    expect(parciais).toHaveLength(1);

    const [campos, opts] = parciais[0];
    expect(campos).toEqual({ status: 1 });
    expect((opts as Record<string, unknown>).unique).toBe(true);
    expect((opts as Record<string, unknown>).partialFilterExpression).toEqual({
      status: 'rascunho',
    });
  });

  it('existe também o índice NÃO-único em status, para as consultas', () => {
    const simples = indices().filter(
      ([campos, opts]) =>
        (campos as Record<string, unknown>).status === 1 &&
        !(opts as Record<string, unknown>).unique,
    );
    expect(simples).toHaveLength(1);
  });
});
