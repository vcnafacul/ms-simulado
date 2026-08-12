import { LayoutModel } from '../layout/cartao-layout';

export interface OmrFieldBlock {
  fieldType: 'QTYPE_INT' | 'QTYPE_MCQ5';
  origin: [number, number];
  fieldLabels: string[];
  labelsGap: number;
  bubblesGap: number;
}

export interface OmrTemplateJson {
  pageDimensions: [number, number];
  bubbleDimensions: [number, number];
  preProcessors: { name: string; options: Record<string, unknown> }[];
  fieldBlocks: Record<string, OmrFieldBlock>;
}

export interface OmrConfigJson {
  outputs: { show_image_level: number };
}

export function buildTemplateJson(layout: LayoutModel): {
  templateJson: OmrTemplateJson;
  configJson: OmrConfigJson;
} {
  // O LayoutModel guarda `origin` como o CENTRO da primeira bolha (o que o PDF desenha).
  // O OMRChecker, porém, trata `origin` como o CANTO SUPERIOR-ESQUERDO da caixa de amostra
  // (core.py: rect = [y, y+box_h, x, x+box_w]). Logo emitimos origin = centro − bubbleDim/2,
  // pra o centro de amostragem do OMRChecker (origin + índices·gaps + bubbleDim/2) coincidir
  // com o centro visual desenhado pelo PDF.
  const halfW = layout.page.bubbleWidthPx / 2;
  const halfH = layout.page.bubbleHeightPx / 2;
  const fieldBlocks: Record<string, OmrFieldBlock> = {};
  for (const b of layout.fieldBlocks) {
    fieldBlocks[b.key] = {
      fieldType: b.fieldType,
      origin: [b.origin[0] - halfW, b.origin[1] - halfH],
      fieldLabels: b.fieldLabels,
      labelsGap: b.labelsGap,
      bubblesGap: b.bubblesGap,
    };
  }

  const templateJson: OmrTemplateJson = {
    pageDimensions: [layout.page.pageWidthPx, layout.page.pageHeightPx],
    bubbleDimensions: [layout.page.bubbleWidthPx, layout.page.bubbleHeightPx],
    preProcessors: [
      {
        name: 'CropOnMarkers',
        options: {
          relativePath: 'omr_marker.png',
          sheetToMarkerWidthRatio: Math.round(
            layout.page.pageWidthPx / layout.page.markerSizePx,
          ),
        },
      },
    ],
    fieldBlocks,
  };

  const configJson: OmrConfigJson = { outputs: { show_image_level: 0 } };
  return { templateJson, configJson };
}
