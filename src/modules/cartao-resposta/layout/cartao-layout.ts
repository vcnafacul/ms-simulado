export type BubbleShape = 'circle' | 'rect';

export interface PageConfig {
  dpi: number;
  pageWidthPx: number;
  pageHeightPx: number;
  markerSizePx: number;
  markerInsetPx: number;
  // Forma da marca. 'circle' = bolha redonda; 'rect' = retângulo estilo ENEM.
  // A CAIXA que o OMR amostra é sempre bubbleWidthPx × bubbleHeightPx — o desenho (círculo
  // ou retângulo) preenche essa mesma caixa, então leitura e visual ficam sempre casados.
  // Pra um retângulo "1/3 da linha", deixe bubbleHeightPx bem menor que o passo da linha.
  bubbleShape: BubbleShape;
  bubbleWidthPx: number;
  bubbleHeightPx: number;
  matriculaOrigin: [number, number];
  matriculaLabelsGap: number;
  matriculaBubblesGap: number;
  respostasOrigin: [number, number];
  respostasColumnWidthPx: number;
  respostasLabelsGap: number;
  respostasBubblesGap: number;
  maxQuestionsPerColumn: number;
  // Quando true, os blocos de retângulos (A-E) são distribuídos automaticamente na largura
  // útil (caixa dos markers), com margem-esquerda = vão-entre-colunas = margem-direita. Nesse
  // modo respostasOrigin.x e respostasColumnWidthPx são IGNORADOS (só respostasOrigin.y é usado).
  respostasEvenColumns: boolean;
  // Quando true, desenha uma borda em volta de cada coluna de respostas e um fundo cinza
  // claro nas colunas alternadas (zebra). É puramente visual (PDF) — não entra no template.json.
  // O interior de cada retângulo continua branco, então o OMR lê branco-vs-preto sem interferência.
  respostasColumnBox: boolean;
  qrBox: { x: number; y: number; size: number };
  headerBox: { x: number; y: number; width: number; height: number };
}

export const DEFAULT_CONFIG: PageConfig = {
  dpi: 300,
  pageWidthPx: 2480,
  pageHeightPx: 3508,
  markerSizePx: 120,
  markerInsetPx: 100,
  bubbleShape: 'circle',
  bubbleWidthPx: 60,
  bubbleHeightPx: 60,
  matriculaOrigin: [340, 900],
  matriculaLabelsGap: 95,
  matriculaBubblesGap: 78,
  respostasOrigin: [230, 1720],
  respostasColumnWidthPx: 760,
  respostasLabelsGap: 50,
  respostasBubblesGap: 92,
  maxQuestionsPerColumn: 30,
  respostasEvenColumns: false,
  respostasColumnBox: false,
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

  // Quantas colunas cabem N questões, dado o teto por coluna; distribui BALANCEADO
  // (ex.: N=45 → 23+22, não 30+15). O nº de colunas vem só de N — "auto-fit".
  const numColumns = Math.max(1, Math.ceil(N / cfg.maxQuestionsPerColumn));

  // X (centro da 1ª bolha "A") de cada coluna. Dois modos:
  // - fixo: respostasOrigin.x + c·respostasColumnWidthPx (padrão);
  // - even: distribui na largura útil (caixa dos markers) com margem esq. = vão = margem dir.
  let columnOriginX: (c: number) => number;
  if (cfg.respostasEvenColumns) {
    // Distribui os BLOCOS de retângulos (A-E) igualmente sobre a LARGURA DA PÁGINA INTEIRA:
    // margem-esquerda (borda da página → 1º bloco) = vão entre blocos = margem-direita.
    // O número da questão flutua no vão à esquerda de cada bloco (como no ENEM).
    // Atenção: os retângulos precisam cair dentro da caixa dos markers (senão o OMR corta);
    // se os markers forem afastados demais pro vão calculado, o script avisa (warnIfOverflow).
    const blockWidth = 4 * cfg.respostasBubblesGap + cfg.bubbleWidthPx;
    const gutter =
      (cfg.pageWidthPx - numColumns * blockWidth) / (numColumns + 1);
    columnOriginX = (c) =>
      gutter + c * (blockWidth + gutter) + cfg.bubbleWidthPx / 2;
  } else {
    columnOriginX = (c) =>
      cfg.respostasOrigin[0] + c * cfg.respostasColumnWidthPx;
  }

  const base = Math.floor(N / numColumns);
  const remainder = N % numColumns;
  let nextQuestion = 1;
  for (let c = 0; c < numColumns; c++) {
    const countThisColumn = base + (c < remainder ? 1 : 0);
    const first = nextQuestion;
    const last = nextQuestion + countThisColumn - 1;
    nextQuestion = last + 1;
    fieldBlocks.push({
      key: `respostas_c${c + 1}`,
      fieldType: 'QTYPE_MCQ5',
      origin: [columnOriginX(c), cfg.respostasOrigin[1]],
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
