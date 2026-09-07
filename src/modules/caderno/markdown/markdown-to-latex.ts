import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { compilar, Contexto } from './handlers';
import { agruparHtml } from './pre-transform/agrupar-html';
import { neutralizarReal } from './pre-transform/neutralizar-real';
import { restaurarDisplay } from './pre-transform/restaurar-display';

/**
 * Markdown com LaTeX inline → LaTeX pronto para o `conteudo.tex`.
 *
 * O subset suportado **não é markdown genérico**: é exatamente o que o editor
 * do projeto grava. A fonte da verdade é
 * `client-vcnafacul/src/components/molecules/richTextEditor/useRichTextEditor.ts`
 * — e são DOIS serializers ali (`tiptap-markdown` e o `serializeDocToMarkdown`
 * manual), com formatos diferentes para a mesma construção. As fixtures em
 * `fixtures/` levam o prefixo `tm-`/`sd-` justamente por isso. Extensão nova
 * no editor = handler novo aqui.
 */
export interface ConversaoResultado {
  latex: string;
  /** Keys `asset://` encontradas, na ordem de aparição, sem repetição. */
  assets: string[];
  /**
   * O que a pessoa precisa conferir na questão. Sem o número da questão: quem
   * sabe é o card 03, e é ele que prefixa.
   */
  avisos: string[];
}

/**
 * Construído UMA vez, no carregamento do módulo. `unified()` monta a cadeia de
 * plugins do zero a cada chamada, e um caderno tem ~90 questões × 7 campos.
 *
 * ⚠️ Só `.parse()`, nunca `.run()`/`.process()`: quem transforma são as três
 * funções abaixo, e `.run()` é assíncrono — arrastaria o card 03 inteiro para
 * async sem ganho nenhum.
 */
const PROCESSADOR = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/**
 * ⚠️ A ORDEM DAS QUATRO ETAPAS É O CONTRATO DESTE ARQUIVO. As duas restrições
 * abaixo quebram **em silêncio** — sem erro, sem aviso, só um PDF pior:
 *
 * 1. `neutralizarReal` roda ANTES do parser. O estrago que ele evita acontece
 *    na tokenização (`R$ 50,00 e outro R$ 30,00` vira um `inlineMath` que come
 *    a prosa do meio); depois que o nó existe, a informação já se perdeu.
 *
 * 2. `restaurarDisplay` recebe a string NEUTRALIZADA, não o markdown original.
 *    Ele acha o `$$` pelo `position.start.offset` do nó, e esses offsets são
 *    relativos ao que o parser leu. O marcador do `neutralizarReal` tem
 *    tamanho diferente de `R$`, então passar o original desloca os offsets e
 *    as fórmulas simplesmente param de virar display.
 */
export function markdownToLatex(
  markdown: string,
  opts: { resolveAsset: (key: string) => string },
): ConversaoResultado {
  const ctx: Contexto = {
    resolveAsset: opts.resolveAsset,
    assets: [],
    avisos: [],
  };

  const neutralizado = neutralizarReal(markdown ?? '');
  const arvore = PROCESSADOR.parse(neutralizado);

  restaurarDisplay(arvore, neutralizado);
  agruparHtml(arvore);

  // `.trim()` porque o chamador (card 03) emenda os campos num `.tex` só e
  // não deveria ter que limpar sobra de linha em branco de cada um.
  return {
    latex: compilar(arvore, ctx).trim(),
    assets: ctx.assets,
    avisos: ctx.avisos,
  };
}
