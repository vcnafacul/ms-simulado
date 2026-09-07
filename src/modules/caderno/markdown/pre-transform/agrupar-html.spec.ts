import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { agruparHtml, NO_ALINHADO } from './agrupar-html';

const parse = (md: string): any =>
  unified().use(remarkParse).use(remarkGfm).parse(md);

const ALINHADO_CENTRO = '<div style="text-align: center">';

describe('agruparHtml', () => {
  it('envolve os irmãos entre a abertura e o fechamento', () => {
    // O remark-parse não parseia HTML: a abertura e o fechamento viram dois
    // nós `html` IRMÃOS, com o conteúdo entre eles como nós normais. Não há
    // aninhamento nenhum — é isso que faz o alinhamento sumir se ninguém
    // tratar.
    const arvore = parse(`${ALINHADO_CENTRO}\n\numa\n\noutra\n\n</div>`);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'html',
      'paragraph',
      'paragraph',
      'html',
    ]);

    agruparHtml(arvore);

    expect(arvore.children.map((n: any) => n.type)).toEqual([NO_ALINHADO]);
    expect(arvore.children[0].align).toBe('center');
    expect(arvore.children[0].children.map((n: any) => n.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });

  it('reconhece right e justify', () => {
    for (const alinhamento of ['right', 'justify']) {
      const arvore = parse(
        `<div style="text-align: ${alinhamento}">\n\ntexto\n\n</div>`,
      );
      agruparHtml(arvore);
      expect(arvore.children[0].align).toBe(alinhamento);
    }
  });

  it('deixa o resto do documento em paz', () => {
    const arvore = parse(
      `antes\n\n${ALINHADO_CENTRO}\n\nmeio\n\n</div>\n\ndepois`,
    );
    agruparHtml(arvore);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'paragraph',
      NO_ALINHADO,
      'paragraph',
    ]);
  });

  it('não agrupa quando falta o fechamento', () => {
    // Sem par, deixa como está: o handler de `html` emite aviso.
    const arvore = parse(`${ALINHADO_CENTRO}\n\nsozinha`);
    agruparHtml(arvore);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'html',
      'paragraph',
    ]);
  });

  it('não mexe em documento sem HTML', () => {
    const arvore = parse('só texto\n\ne mais texto');
    agruparHtml(arvore);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });
});
