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
  const fieldBlocks: Record<string, OmrFieldBlock> = {};
  for (const b of layout.fieldBlocks) {
    fieldBlocks[b.key] = {
      fieldType: b.fieldType,
      origin: b.origin,
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
