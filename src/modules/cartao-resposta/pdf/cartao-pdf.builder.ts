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

// Container de cada coluna: zebra POR LINHA (faixa cinza nas linhas pares, cobrindo a largura
// toda: número + retângulos) + borda. Desenhado ATRÁS das bolhas (interior branco), então é só
// decorativo — não afeta a leitura do OMR (validado). Número fica DENTRO do container.
function collectColumnBoxes(layout: LayoutModel): unknown[] {
  if (!layout.page.respostasColumnBox) return [];
  const cfg = layout.page;
  const bw = cfg.bubbleWidthPx;
  const bh = cfg.bubbleHeightPx;
  const padTop = 78; // folga acima da 1ª linha (px) — cobre o cabeçalho A-E
  const padBottom = 14; // folga abaixo da última linha (px)
  const out: unknown[] = [];
  const cols = layout.fieldBlocks.filter((b) =>
    b.key.startsWith('respostas_c'),
  );
  cols.forEach((b) => {
    const [first, last] = parseRange(b.fieldLabels[0]);
    const nRows = last - first + 1;
    // container: [padding][número][retângulos][padding] — padding igual dos dois lados.
    const left =
      b.origin[0] - bw / 2 - cfg.respostasNumberWidthPx - cfg.respostasBoxPadPx;
    const right =
      b.origin[0] + 4 * b.bubblesGap + bw / 2 + cfg.respostasBoxPadPx;
    const top = b.origin[1] - bh / 2 - padTop;
    const bottom = b.origin[1] + (nRows - 1) * b.labelsGap + bh / 2 + padBottom;

    // zebra por linha: faixa cinza nas linhas pares (2ª, 4ª… = índice ímpar), largura toda,
    // limitada ao interior do container.
    for (let i = 1; i < nRows; i += 2) {
      const rowCy = b.origin[1] + i * b.labelsGap;
      const stripeTop = Math.max(top, rowCy - b.labelsGap / 2);
      const stripeBottom = Math.min(bottom, rowCy + b.labelsGap / 2);
      out.push({
        type: 'rect',
        x: pt(left),
        y: pt(stripeTop),
        w: pt(right - left),
        h: pt(stripeBottom - stripeTop),
        color: '#ededed',
      });
    }
    // borda do container por cima das faixas
    out.push({
      type: 'rect',
      x: pt(left),
      y: pt(top),
      w: pt(right - left),
      h: pt(bottom - top),
      lineColor: '#bdbdbd',
      lineWidth: 1,
    });
  });
  return out;
}

// Matrícula com o mesmo tratamento: container + borda, zebra por linha de dígito (0-9), e uma
// fileira de quadros em cima pro aluno ESCREVER os 8 dígitos à mão. Atrás das bolhas (brancas).
function collectMatriculaDecorations(layout: LayoutModel): unknown[] {
  if (!layout.page.matriculaBox) return [];
  const cfg = layout.page;
  const mat = layout.fieldBlocks.find((b) => b.key === 'matricula');
  if (!mat) return [];
  const bw = cfg.bubbleWidthPx;
  const bh = cfg.bubbleHeightPx;
  const nCols = 8;
  const nDigits = 10;
  const ox = mat.origin[0];
  const oy = mat.origin[1];
  const pad = cfg.respostasBoxPadPx;
  const labelSpace = 42; // espaço pros rótulos 0-9 à esquerda
  const hwH = 78; // altura dos quadros de escrita
  const hwGap = 24; // folga entre os quadros e o grid de bolhas
  const titleSpace = 62; // espaço acima dos quadros pro título "Matrícula"

  const gridLeft = ox - bw / 2;
  const gridRight = ox + (nCols - 1) * mat.labelsGap + bw / 2;
  const hwTop = oy - bh / 2 - hwGap - hwH;
  const boxLeft = gridLeft - labelSpace - pad;
  const boxRight = gridRight + pad;
  const boxTop = hwTop - titleSpace - pad;
  const boxBottom = oy + (nDigits - 1) * mat.bubblesGap + bh / 2 + pad;

  const out: unknown[] = [];
  // zebra por linha de dígito (1,3,5,7,9 cinza), cobrindo a largura toda do container
  for (let j = 1; j < nDigits; j += 2) {
    const rowCy = oy + j * mat.bubblesGap;
    out.push({
      type: 'rect',
      x: pt(boxLeft),
      y: pt(rowCy - mat.bubblesGap / 2),
      w: pt(boxRight - boxLeft),
      h: pt(mat.bubblesGap),
      color: '#ededed',
    });
  }
  // quadros de escrita à mão (um por coluna, interior branco por cima da zebra)
  const hwW = Math.min(bw * 1.4, mat.labelsGap - 22);
  for (let i = 0; i < nCols; i++) {
    const cx = ox + i * mat.labelsGap;
    out.push({
      type: 'rect',
      x: pt(cx - hwW / 2),
      y: pt(hwTop),
      w: pt(hwW),
      h: pt(hwH),
      lineColor: '#000000',
      lineWidth: 1,
      color: 'white',
    });
  }
  // borda do container
  out.push({
    type: 'rect',
    x: pt(boxLeft),
    y: pt(boxTop),
    w: pt(boxRight - boxLeft),
    h: pt(boxBottom - boxTop),
    lineColor: '#bdbdbd',
    lineWidth: 1,
  });
  return out;
}

function collectBubbleShapes(layout: LayoutModel): unknown[] {
  const shape = layout.page.bubbleShape;
  const w = pt(layout.page.bubbleWidthPx);
  const h = pt(layout.page.bubbleHeightPx);
  const out: unknown[] = [];

  // A marca (círculo ou retângulo) ocupa exatamente a caixa bubbleWidth × bubbleHeight,
  // centrada no ponto que o OMR amostra — desenho e leitura sempre casados.
  // Interior BRANCO (color: 'white') pra o OMR ler branco-vs-preto mesmo com fundo cinza atrás.
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
          color: 'white',
        }
      : {
          type: 'ellipse',
          x: cx,
          y: cy,
          r1: w / 2,
          r2: h / 2,
          lineWidth: 1,
          lineColor: '#000000',
          color: 'white',
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
  // Título da matrícula acima dos quadros de escrita (quando o container está ligado)
  if (layout.page.matriculaBox) {
    const bh = layout.page.bubbleHeightPx;
    const hwTop = mat.origin[1] - bh / 2 - 24 - 78; // = oy - bh/2 - hwGap - hwH
    items.push({
      text: 'MATRÍCULA — escreva e preencha',
      absolutePosition: {
        x: pt(mat.origin[0] - layout.page.bubbleWidthPx / 2 - 42),
        y: pt(hwTop - 52),
      },
      fontSize: 9,
      bold: true,
    });
  }

  // Respostas: option letters (A-E) on top, question numbers on the side
  const OPT_FONT = 8;
  const OPT_LABEL_GAP_PT = 4; // respiro entre o rótulo A-E e o topo do 1º retângulo
  const NUM_GAP_PT = 6; // respiro entre o número da questão e a borda esq. da 1ª marca
  const NUM_CHAR_PT = OPT_FONT * 0.58; // largura aprox. de um dígito em pt (fonte 8)
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
      // "Alinha à direita" na mão: a borda esq. da 1ª marca menos o respiro é onde o número
      // termina; recuo o x pela largura estimada do texto, pra 1 ou 2 dígitos ficarem à
      // mesma distância do retângulo. (alignment/width não valem com absolutePosition.)
      const numRightPt =
        pt(b.origin[0] - layout.page.bubbleWidthPx / 2) - NUM_GAP_PT;
      for (let q = first; q <= last; q++) {
        const c = layout.bubbleCenter(b.key, q - first, 0);
        const label = String(q);
        items.push({
          text: label,
          absolutePosition: {
            x: numRightPt - label.length * NUM_CHAR_PT,
            y: pt(c.y - 12),
          },
          fontSize: OPT_FONT,
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
        // fundos/bordas (respostas + matrícula) primeiro (atrás), depois as bolhas (interior branco).
        canvas: [
          ...collectColumnBoxes(layout),
          ...collectMatriculaDecorations(layout),
          ...collectBubbleShapes(layout),
        ],
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
