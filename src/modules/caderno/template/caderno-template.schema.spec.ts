import { model } from 'mongoose';
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

  /**
   * ⚠️ **O teste que faltava.** Todo o resto deste diretório é mock: nada
   * cast um documento pelo Mongoose de verdade, e foi exatamente por isso que
   * o `type: Map` original passou por spec, review e seis tasks.
   *
   * Com `type: Map`, Mongoose 7 recusa chave com `.`: o write lança
   * `CastError` e o read hidratado devolve `arquivos` **`undefined`** — em
   * silêncio, porque `.lean()` continua mostrando o campo. Como as chaves são
   * `main.tex` e `preambulo.tex` por construção (os `ALVOS` de
   * `extrair-zip.ts`), o campo simplesmente nunca chegaria ao gerador.
   *
   * ⚠️ Não precisa de banco: `hydrate` cast pelo schema offline, então isto
   * roda no CI junto com o resto.
   */
  it('CHAVE COM PONTO: o documento cru do seed hidrata com os arquivos', () => {
    const Modelo = model('CadernoTemplateHydrateSpec', CadernoTemplateSchema);

    // Exatamente a forma que `scripts/seed-template-caderno.ts` grava.
    const cru: Record<string, unknown> = {
      versao: 1,
      status: 'publicada',
      arquivos: {
        'main.tex': '\\documentclass{article}',
        'preambulo.tex': '\\usepackage{amsmath}',
      },
      criadorId: 'system',
      notas: 'seed do repo',
      origemVersao: null,
    };

    const doc = Modelo.hydrate(cru);

    expect(doc.get('arquivos')).toBeDefined();
    expect(doc.get('arquivos')['main.tex']).toBe('\\documentclass{article}');
    expect(doc.get('arquivos')['preambulo.tex']).toBe('\\usepackage{amsmath}');
  });

  /** O outro lado: escrever chave pontilhada também tem que passar no cast. */
  it('CHAVE COM PONTO: validação aceita escrever os dois nomes da whitelist', async () => {
    const Modelo = model('CadernoTemplateCastSpec', CadernoTemplateSchema);

    const doc = new Modelo({
      versao: 2,
      status: 'rascunho',
      arquivos: { 'main.tex': 'a', 'preambulo.tex': 'b' },
      criadorId: 'alguem',
    });

    await expect(doc.validate()).resolves.toBeUndefined();
    expect(doc.get('arquivos')['main.tex']).toBe('a');
  });
});
