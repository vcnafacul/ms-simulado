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

// Logo do projeto (Você na Facul) — 296×62 nativo. Data URL pro pdfmake 0.3.x.
const LOGO_PATH = path.join(__dirname, '../assets/logo.png');
const logoDataUrl =
  'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64');

// Layout do cabeçalho (px, relativos ao headerBox): logo → nome do simulado → "Nome do
// Estudante" → linha de preenchimento.
const LOGO_W = 440;
const LOGO_H = Math.round((LOGO_W * 62) / 296); // mantém a proporção da logo
// (fontes em pt são grandes em px: 15pt≈62px, 11pt≈46px — os gaps abaixo já contam com isso)
const HEADER_TITLE_DY = LOGO_H + 30; // nome do simulado, abaixo da logo
const HEADER_NAME_DY = HEADER_TITLE_DY + 70; // rótulo "Nome do Estudante" (abaixo do título)
const HEADER_LINE_DY = HEADER_NAME_DY + 95; // linha de preenchimento (espaço pro aluno escrever)
const HEADER_LINE_W = 1250; // comprimento da linha de preenchimento

function parseRange(label: string): [number, number] {
  const m = label.match(/[a-z]+(\d+)\.\.(\d+)/i);
  if (!m) throw new Error(`range inválido: ${label}`);
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

// Quebra um texto em linhas de até `maxChars` caracteres (o pdfmake não respeita `width`
// junto com absolutePosition, então quebramos na mão e posicionamos cada linha).
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
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

// Geometria dos quadros de escrita da matrícula (px).
const MAT_HW_H = 78; // altura dos quadros de escrita
const MAT_HW_GAP = 24; // folga entre os quadros e o grid de bolhas
const MAT_TITLE_SPACE = 62; // espaço acima dos quadros pro título "Matrícula"

// Limites do container da matrícula — usado pelas decorações e pra alinhar as instruções.
function matriculaBounds(layout: LayoutModel) {
  const cfg = layout.page;
  const mat = layout.fieldBlocks.find((b) => b.key === 'matricula')!;
  const bw = cfg.bubbleWidthPx;
  const bh = cfg.bubbleHeightPx;
  const pad = cfg.respostasBoxPadPx;
  const labelSpace = cfg.matriculaSideLabelPx;
  const ox = mat.origin[0];
  const oy = mat.origin[1];
  const gridLeft = ox - bw / 2;
  const gridRight = ox + 7 * mat.labelsGap + bw / 2;
  const hwTop = oy - bh / 2 - MAT_HW_GAP - MAT_HW_H;
  return {
    mat,
    bw,
    bh,
    pad,
    labelSpace,
    ox,
    oy,
    hwTop,
    boxLeft: gridLeft - labelSpace - pad,
    boxRight: gridRight + labelSpace + pad,
    boxTop: hwTop - MAT_TITLE_SPACE - pad,
    boxBottom: oy + 9 * mat.bubblesGap + bh / 2 + pad,
  };
}

// Matrícula com o mesmo tratamento: container + borda, zebra por linha de dígito (0-9), e uma
// fileira de quadros em cima pro aluno ESCREVER os 8 dígitos à mão. Atrás das bolhas (brancas).
function collectMatriculaDecorations(layout: LayoutModel): unknown[] {
  if (!layout.page.matriculaBox) return [];
  const b = matriculaBounds(layout);
  const { mat, bw, bh, ox, oy, hwTop, boxLeft, boxRight, boxTop, boxBottom } =
    b;
  const nCols = 8;
  const nDigits = 10;
  const hwH = MAT_HW_H;

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

const INSTR_GAP = 60; // vão entre a matrícula e as instruções

// Limites do container de instruções: à direita da matrícula, topo/base alinhados com ela,
// e a borda DIREITA alinhada com a borda direita do último container de respostas.
function instructionsBounds(layout: LayoutModel) {
  const cfg = layout.page;
  const mb = matriculaBounds(layout);
  const respCols = layout.fieldBlocks.filter((b) =>
    b.key.startsWith('respostas_c'),
  );
  const last = respCols[respCols.length - 1];
  const right = last
    ? last.origin[0] +
      4 * last.bubblesGap +
      cfg.bubbleWidthPx / 2 +
      cfg.respostasBoxPadPx
    : cfg.qrBox.x - INSTR_GAP;
  return {
    left: mb.boxRight + INSTR_GAP,
    right,
    top: mb.boxTop,
    bottom: mb.boxBottom,
  };
}

// Borda do container de instruções, à direita da matrícula.
function collectInstructionsBox(layout: LayoutModel): unknown[] {
  if (!layout.page.instructionsBox || !layout.page.matriculaBox) return [];
  const b = instructionsBounds(layout);
  if (b.right - b.left < 200) return [];
  return [
    {
      type: 'rect',
      x: pt(b.left),
      y: pt(b.top),
      w: pt(b.right - b.left),
      h: pt(b.bottom - b.top),
      lineColor: '#bdbdbd',
      lineWidth: 1,
    },
  ];
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

// Linha de preenchimento do nome do estudante (desenhada no canvas).
function collectHeaderShapes(layout: LayoutModel): unknown[] {
  const hb = layout.page.headerBox;
  const y = hb.y + HEADER_LINE_DY;
  return [
    {
      type: 'line',
      x1: pt(hb.x),
      y1: pt(y),
      x2: pt(hb.x + HEADER_LINE_W),
      y2: pt(y),
      lineWidth: 1,
      lineColor: '#000000',
    },
  ];
}

function collectLabels(layout: LayoutModel, header: HeaderData): unknown[] {
  const items: unknown[] = [];

  // Cabeçalho: nome do simulado (grande) + "Nome do Estudante" (a logo é imagem, a linha é
  // desenhada no canvas — ver buildCartaoPdf e collectHeaderShapes).
  const hb = layout.page.headerBox;
  items.push({
    text: header.nomeSimulado,
    absolutePosition: { x: pt(hb.x), y: pt(hb.y + HEADER_TITLE_DY) },
    fontSize: 15,
    bold: true,
  });
  items.push({
    text: 'Nome do Estudante',
    absolutePosition: { x: pt(hb.x), y: pt(hb.y + HEADER_NAME_DY) },
    fontSize: 9,
  });

  // Matrícula digit labels (0-9 à esquerda; e também à direita quando o container está ligado)
  const mat = layout.fieldBlocks.find((b) => b.key === 'matricula')!;
  const matBw = layout.page.bubbleWidthPx;
  for (let j = 0; j < 10; j++) {
    const c = layout.bubbleCenter('matricula', 0, j);
    items.push({
      text: String(j),
      absolutePosition: { x: pt(mat.origin[0] - 55), y: pt(c.y - 12) },
      fontSize: 8,
    });
  }
  if (layout.page.matriculaBox) {
    const bh = layout.page.bubbleHeightPx;
    const labelSpace = layout.page.matriculaSideLabelPx;
    const pad = layout.page.respostasBoxPadPx;
    const hwTop = mat.origin[1] - bh / 2 - 24 - 78; // = oy - bh/2 - hwGap - hwH
    const gridLeft = mat.origin[0] - matBw / 2;
    const gridRight = mat.origin[0] + 7 * mat.labelsGap + matBw / 2;
    const boxLeft = gridLeft - labelSpace - pad;
    const boxRight = gridRight + labelSpace + pad;
    // rótulos 0-9 espelhados à direita
    for (let j = 0; j < 10; j++) {
      const c = layout.bubbleCenter('matricula', 7, j);
      items.push({
        text: String(j),
        absolutePosition: { x: pt(c.x + matBw / 2 + 12), y: pt(c.y - 12) },
        fontSize: 8,
      });
    }
    // título centralizado sobre o container — centralizado NA MÃO (largura/alignment não
    // funcionam com absolutePosition no pdfmake), estimando a largura do texto.
    const titleText = 'Código de Matrícula';
    const titleFont = 9;
    const titleWidthPx = (titleText.length * titleFont * 0.52) / K; // estimativa (bold)
    const boxCenterPx = (boxLeft + boxRight) / 2;
    items.push({
      text: titleText,
      absolutePosition: {
        x: pt(boxCenterPx - titleWidthPx / 2),
        y: pt(hwTop - 52),
      },
      fontSize: titleFont,
      bold: true,
    });
  }

  // Instruções: título + lista numerada (quebra de linha na mão), dentro do container à
  // direita da matrícula.
  if (layout.page.instructionsBox && layout.page.matriculaBox) {
    const ib = instructionsBounds(layout);
    if (ib.right - ib.left >= 200) {
      const padL = 30; // padding interno esquerdo
      const padR = 55; // padding interno direito (espaço entre texto e a borda do container)
      const numIndent = 48; // recuo do texto após o "N." (px)
      const font = 10;
      const lineH = (font * 1.4) / K; // altura de linha (px)
      const textX = ib.left + padL + numIndent;
      const innerW = ib.right - ib.left - padL - numIndent - padR;
      const maxChars = Math.floor((innerW * K) / (font * 0.48)); // estimativa
      const instrs: { text: string; bold?: string }[] = [
        {
          text: 'Busque escrever o nome com letra legível, de preferência de forma.',
        },
        {
          text: 'Preencha as bolhas completamente, com caneta esferográfica preta. Não use lápis nem caneta de outra cor.',
        },
        {
          text: 'O cartão-resposta é o único documento usado para a correção do simulado. Não amasse, não dobre nem rasure.',
          bold: 'cartão-resposta',
        },
      ];
      items.push({
        text: 'Instruções',
        absolutePosition: {
          x: pt(ib.left + padL),
          y: pt(ib.top + padL),
        },
        fontSize: 13,
        bold: true,
      });
      let y = ib.top + padL + 76; // mais espaço entre o título e os itens
      instrs.forEach((instr, idx) => {
        const lines = wrapText(instr.text, maxChars);
        items.push({
          text: `${idx + 1}.`,
          absolutePosition: { x: pt(ib.left + padL), y: pt(y) },
          fontSize: font,
        });
        lines.forEach((ln, li) => {
          // negrito na palavra pedida (fica inteira numa linha, sem espaço interno)
          let content: unknown = ln;
          if (instr.bold && ln.includes(instr.bold)) {
            const i = ln.indexOf(instr.bold);
            content = [
              { text: ln.slice(0, i) },
              { text: instr.bold, bold: true },
              { text: ln.slice(i + instr.bold.length) },
            ];
          }
          items.push({
            text: content,
            absolutePosition: { x: pt(textX), y: pt(y + li * lineH) },
            fontSize: font,
          });
        });
        y += lines.length * lineH + lineH * 0.75; // mais respiro entre itens
      });
    }
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
        // fundos/bordas (respostas + matrícula) + linha do cabeçalho; depois as bolhas (interior branco).
        canvas: [
          ...collectColumnBoxes(layout),
          ...collectMatriculaDecorations(layout),
          ...collectInstructionsBox(layout),
          ...collectHeaderShapes(layout),
          ...collectBubbleShapes(layout),
        ],
        absolutePosition: { x: 0, y: 0 },
      },
      {
        image: logoDataUrl,
        width: pt(LOGO_W),
        absolutePosition: {
          x: pt(layout.page.headerBox.x),
          y: pt(layout.page.headerBox.y),
        },
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
