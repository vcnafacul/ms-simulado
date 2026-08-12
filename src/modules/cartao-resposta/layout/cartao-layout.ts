export interface PageConfig {
  dpi: number;
  pageWidthPx: number;
  pageHeightPx: number;
  markerSizePx: number;
  markerInsetPx: number;
  bubbleWidthPx: number;
  bubbleHeightPx: number;
  matriculaOrigin: [number, number];
  matriculaLabelsGap: number;
  matriculaBubblesGap: number;
  respostasOrigin: [number, number];
  respostasColumnWidthPx: number;
  respostasLabelsGap: number;
  respostasBubblesGap: number;
  questionsPerColumn: number;
  qrBox: { x: number; y: number; size: number };
  headerBox: { x: number; y: number; width: number; height: number };
}

export const DEFAULT_CONFIG: PageConfig = {
  dpi: 300,
  pageWidthPx: 2480,
  pageHeightPx: 3508,
  markerSizePx: 120,
  markerInsetPx: 100,
  bubbleWidthPx: 60,
  bubbleHeightPx: 60,
  matriculaOrigin: [340, 900],
  matriculaLabelsGap: 95,
  matriculaBubblesGap: 78,
  respostasOrigin: [230, 1720],
  respostasColumnWidthPx: 760,
  respostasLabelsGap: 50,
  respostasBubblesGap: 92,
  questionsPerColumn: 30,
  qrBox: { x: 2000, y: 150, size: 320 },
  headerBox: { x: 150, y: 150, width: 1750, height: 560 },
};

export type FieldType = 'QTYPE_INT' | 'QTYPE_MCQ5';

export interface FieldBlockLayout {
  key: string;
  fieldType: FieldType;
  origin: [number, number];
  fieldLabels: string[];
  labelsGap: number;
  bubblesGap: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutModel {
  page: PageConfig;
  N: number;
  markers: Point[];
  fieldBlocks: FieldBlockLayout[];
  bubbleCenter(fieldKey: string, labelIndex: number, valueIndex: number): Point;
}

export function buildLayout(
  N: number,
  cfg: PageConfig = DEFAULT_CONFIG,
): LayoutModel {
  const markerHalf = cfg.markerSizePx / 2;
  const near = cfg.markerInsetPx + markerHalf;
  const markers: Point[] = [
    { x: near, y: near },
    { x: cfg.pageWidthPx - near, y: near },
    { x: near, y: cfg.pageHeightPx - near },
    { x: cfg.pageWidthPx - near, y: cfg.pageHeightPx - near },
  ];

  const fieldBlocks: FieldBlockLayout[] = [
    {
      key: 'matricula',
      fieldType: 'QTYPE_INT',
      origin: [...cfg.matriculaOrigin] as [number, number],
      fieldLabels: ['m1..8'],
      labelsGap: cfg.matriculaLabelsGap,
      bubblesGap: cfg.matriculaBubblesGap,
    },
  ];

  const numColumns = Math.ceil(N / cfg.questionsPerColumn);
  for (let c = 0; c < numColumns; c++) {
    const first = c * cfg.questionsPerColumn + 1;
    const last = Math.min((c + 1) * cfg.questionsPerColumn, N);
    fieldBlocks.push({
      key: `respostas_c${c + 1}`,
      fieldType: 'QTYPE_MCQ5',
      origin: [
        cfg.respostasOrigin[0] + c * cfg.respostasColumnWidthPx,
        cfg.respostasOrigin[1],
      ],
      fieldLabels: [`q${first}..${last}`],
      labelsGap: cfg.respostasLabelsGap,
      bubblesGap: cfg.respostasBubblesGap,
    });
  }

  const byKey = new Map(fieldBlocks.map((b) => [b.key, b]));

  return {
    page: cfg,
    N,
    markers,
    fieldBlocks,
    bubbleCenter(fieldKey, labelIndex, valueIndex) {
      const b = byKey.get(fieldKey);
      if (!b) throw new Error(`fieldBlock desconhecido: ${fieldKey}`);
      if (b.fieldType === 'QTYPE_INT') {
        return {
          x: b.origin[0] + labelIndex * b.labelsGap,
          y: b.origin[1] + valueIndex * b.bubblesGap,
        };
      }
      return {
        x: b.origin[0] + valueIndex * b.bubblesGap,
        y: b.origin[1] + labelIndex * b.labelsGap,
      };
    },
  };
}
