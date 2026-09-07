import { visitar } from './visitar';

/** Chave em `node.data` que marca uma fórmula como display. */
export const EH_DISPLAY = 'cadernoDisplay';

/**
 * Restaura a distinção display/inline que o parser perde.
 *
 * Medido: o `remark-math` só produz nó `math` (display) quando os
 * delimitadores estão em linhas próprias. O editor
 * (`serializeInlineContent`) grava `$$formula$$` numa linha só, inline no
 * parágrafo — então todo display chega como `inlineMath`, indistinguível de
 * uma fórmula inline pelo mdast sozinho.
 *
 * A fonte ainda sabe: o nó carrega `position.start.offset`, e o trecho que o
 * originou começa com `$$` ou com `$`.
 *
 * ⚠️ `fonteParseada` tem que ser a MESMA string que foi entregue ao parser —
 * a já neutralizada pelo `neutralizarReal`, não o markdown original. Os
 * offsets são relativos a ela. Reordenar o pipeline desalinha isto em
 * silêncio: as fórmulas param de virar display, sem erro nenhum.
 */
export function restaurarDisplay(arvore: any, fonteParseada: string): void {
  visitar(arvore, (no: any) => {
    if (no.type !== 'inlineMath') return;

    const inicio = no.position?.start?.offset;
    if (typeof inicio !== 'number') return;

    if (fonteParseada.startsWith('$$', inicio)) {
      no.data = { ...(no.data ?? {}), [EH_DISPLAY]: true };
    }
  });
}
