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
  // Duas correções de convenção do OMRChecker, ambas necessárias pra leitura bater:
  //
  // 1) CropOnMarkers (CropOnMarkers.py:153,161) faz four_point_transform usando os CENTROS
  //    dos 4 markers → a imagem lida vive no "espaço da caixa dos centros de marker", não no
  //    A4 inteiro. Então pageDimensions = caixa dos centros e as coordenadas dos fieldBlocks
  //    são relativas ao centro do marker superior-esquerdo (`near`).
  // 2) O OMRChecker trata `origin`/cada bolha como CANTO SUPERIOR-ESQUERDO da caixa de amostra
  //    (core.py: rect = [y, y+box_h, x, x+box_w]); o centro de amostragem = origin + índices·gaps
  //    + bubbleDim/2. Logo emitimos origin = centroVisual − centroMarkerTL − bubbleDim/2.
  //
  // O PDF e o LayoutModel continuam em espaço A4 (centro visual real); só o template.json
  // é reexpresso no espaço normalizado pelos markers.
  const halfW = layout.page.bubbleWidthPx / 2;
  const halfH = layout.page.bubbleHeightPx / 2;
  const near = layout.page.markerInsetPx + layout.page.markerSizePx / 2;
  const markerBoxW = layout.page.pageWidthPx - 2 * near;
  const markerBoxH = layout.page.pageHeightPx - 2 * near;

  // O OMRChecker exige TODAS as coordenadas do template como inteiros (jsonschema). Arredondamos
  // aqui (o desvio sub-pixel vs. o PDF é irrelevante — a caixa de amostragem tem dezenas de px).
  const fieldBlocks: Record<string, OmrFieldBlock> = {};
  for (const b of layout.fieldBlocks) {
    fieldBlocks[b.key] = {
      fieldType: b.fieldType,
      origin: [
        Math.round(b.origin[0] - near - halfW),
        Math.round(b.origin[1] - near - halfH),
      ],
      fieldLabels: b.fieldLabels,
      labelsGap: Math.round(b.labelsGap),
      bubblesGap: Math.round(b.bubblesGap),
    };
  }

  const templateJson: OmrTemplateJson = {
    pageDimensions: [Math.round(markerBoxW), Math.round(markerBoxH)],
    bubbleDimensions: [
      Math.round(layout.page.bubbleWidthPx),
      Math.round(layout.page.bubbleHeightPx),
    ],
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
