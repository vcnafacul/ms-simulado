import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
// pdfmake 0.3.x exports a singleton instance (module.exports = new pdfmake()).
// The API is: pdfMake.setFonts(), pdfMake.setLocalAccessPolicy(), pdfMake.createPdf() → OutputDocumentServer → .getBuffer()
// `import pdfMake = require('pdfmake')` gives the singleton with proper typing from @types/pdfmake.
import pdfMake = require('pdfmake');
import { LayoutModel } from '../layout/cartao-layout';

export interface QrPayload {
  simuladoId: string;
  cursinhoId: string;
  templateVersion: string;
}
export interface HeaderData {
  nomeSimulado: string;
  nomeProva: string;
  nomeCursinho: string;
  qrPayload: QrPayload;
}

const K = 72 / 300; // px(300dpi) → pt
const pt = (px: number) => px * K;

const FONTS_DIR = path.join(__dirname, '../assets/fonts');
const fonts = {
  Roboto: {
    normal: path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONTS_DIR, 'Roboto-Bold.ttf'),
    italics: path.join(FONTS_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONTS_DIR, 'Roboto-BoldItalic.ttf'),
  },
};

// pdfmake 0.3.x requires images to be base64 data URLs when supplied as file paths
// via absolutePosition — loading them up front avoids the local-access-policy warnings.
const MARKER_PATH = path.join(__dirname, '../assets/omr_marker.png');
const markerDataUrl =
  'data:image/png;base64,' + fs.readFileSync(MARKER_PATH).toString('base64');

function parseRange(label: string): [number, number] {
  const m = label.match(/[a-z]+(\d+)\.\.(\d+)/i);
  if (!m) throw new Error(`range inválido: ${label}`);
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function collectBubbleShapes(layout: LayoutModel): unknown[] {
  const shape = layout.page.bubbleShape;
  const w = pt(layout.page.bubbleWidthPx);
  const h = pt(layout.page.bubbleHeightPx);
  const out: unknown[] = [];

  // A marca (círculo ou retângulo) ocupa exatamente a caixa bubbleWidth × bubbleHeight,
  // centrada no ponto que o OMR amostra — desenho e leitura sempre casados.
  const drawShape = (cx: number, cy: number) =>
    shape === 'rect'
      ? {
          type: 'rect',
          x: cx - w / 2,
          y: cy - h / 2,
          w,
          h,
          lineWidth: 1,
          lineColor: '#000000',
        }
      : {
          type: 'ellipse',
          x: cx,
          y: cy,
          r1: w / 2,
          r2: h / 2,
          lineWidth: 1,
          lineColor: '#000000',
        };

  const draw = (fieldKey: string, nLabels: number, nValues: number) => {
    for (let i = 0; i < nLabels; i++) {
      for (let j = 0; j < nValues; j++) {
        const c = layout.bubbleCenter(fieldKey, i, j);
        out.push(drawShape(pt(c.x), pt(c.y)));
      }
    }
  };

  // Matrícula: 8 dígitos × 10 valores (0-9)
  draw('matricula', 8, 10);

  // Respostas: colunas de questões × 5 opções (A-E)
  layout.fieldBlocks
    .filter((b) => b.key.startsWith('respostas_c'))
    .forEach((b) => {
      const [first, last] = parseRange(b.fieldLabels[0]);
      draw(b.key, last - first + 1, 5);
    });

  return out;
}

function collectLabels(layout: LayoutModel, header: HeaderData): unknown[] {
  const items: unknown[] = [];

  // Header text
  items.push({
    text: `${header.nomeSimulado} — ${header.nomeProva}\n${header.nomeCursinho}\nPreencha completamente a alternativa. Nome do aluno: ____________________`,
    absolutePosition: {
      x: pt(layout.page.headerBox.x),
      y: pt(layout.page.headerBox.y),
    },
    fontSize: 10,
    width: pt(layout.page.headerBox.width),
  });

  // Matrícula digit labels (0-9 on the side)
  const mat = layout.fieldBlocks.find((b) => b.key === 'matricula')!;
  for (let j = 0; j < 10; j++) {
    const c = layout.bubbleCenter('matricula', 0, j);
    items.push({
      text: String(j),
      absolutePosition: { x: pt(mat.origin[0] - 55), y: pt(c.y - 12) },
      fontSize: 8,
    });
  }

  // Respostas: option letters (A-E) on top, question numbers on the side
  const OPT_FONT = 8;
  const OPT_LABEL_GAP_PT = 4; // respiro entre o rótulo e o topo do 1º retângulo
  layout.fieldBlocks
    .filter((b) => b.key.startsWith('respostas_c'))
    .forEach((b) => {
      const [first, last] = parseRange(b.fieldLabels[0]);
      // Ancorado ACIMA do topo da primeira marca (não a partir do centro), pra o rótulo
      // não encostar na marca seja qual for a altura (círculo alto ou retângulo baixo).
      // absolutePosition.y é o topo do texto, que cresce pra baixo → subtrai a altura do texto.
      const firstRowTopPt = pt(b.origin[1] - layout.page.bubbleHeightPx / 2);
      const optLabelYPt = firstRowTopPt - OPT_LABEL_GAP_PT - OPT_FONT * 1.2;
      ['A', 'B', 'C', 'D', 'E'].forEach((opt, o) => {
        const c = layout.bubbleCenter(b.key, 0, o);
        items.push({
          text: opt,
          absolutePosition: { x: pt(c.x - 6), y: optLabelYPt },
          fontSize: OPT_FONT,
        });
      });
      for (let q = first; q <= last; q++) {
        const c = layout.bubbleCenter(b.key, q - first, 0);
        items.push({
          text: String(q),
          absolutePosition: { x: pt(b.origin[0] - 70), y: pt(c.y - 12) },
          fontSize: 8,
        });
      }
    });

  return items;
}

export async function buildCartaoPdf(
  layout: LayoutModel,
  header: HeaderData,
): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(header.qrPayload), {
    margin: 0,
  });

  // Marker images: converted to base64 data URLs so pdfmake 0.3.x can embed them
  // without requiring a localAccessPolicy for filesystem access.
  const markerImages = layout.markers.map((m) => ({
    image: markerDataUrl,
    width: pt(layout.page.markerSizePx),
    height: pt(layout.page.markerSizePx),
    absolutePosition: {
      x: pt(m.x - layout.page.markerSizePx / 2),
      y: pt(m.y - layout.page.markerSizePx / 2),
    },
  }));

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [0, 0, 0, 0] as [number, number, number, number],
    content: [
      {
        canvas: collectBubbleShapes(layout),
        absolutePosition: { x: 0, y: 0 },
      },
      {
        image: qrDataUrl,
        width: pt(layout.page.qrBox.size),
        absolutePosition: {
          x: pt(layout.page.qrBox.x),
          y: pt(layout.page.qrBox.y),
        },
      },
      ...markerImages,
      ...collectLabels(layout, header),
    ],
    defaultStyle: { font: 'Roboto' },
  };

  // pdfmake 0.3.x: singleton instance, configure then call createPdf()
  // setFonts must be called before createPdf (it replaces the current font set)
  pdfMake.setFonts(fonts);
  // Allow local filesystem access for font files and block all external URLs
  // (we use data URLs for images, so no URLs are needed)
  pdfMake.setLocalAccessPolicy(() => true);
  pdfMake.setUrlAccessPolicy(() => false);

  const pdfDoc = pdfMake.createPdf(
    docDefinition as Parameters<typeof pdfMake.createPdf>[0],
  );
  // OutputDocumentServer.getBuffer() returns a Promise<Buffer> (typed in TCreatedPdf)
  return pdfDoc.getBuffer();
}
