import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
// pdfmake 0.3.x exports a singleton instance (module.exports = new pdfmake()).
// The API is: pdfMake.setFonts(), pdfMake.setLocalAccessPolicy(), pdfMake.createPdf() → OutputDocumentServer → .getBuffer()
// `import pdfMake = require('pdfmake')` gives the singleton with proper typing from @types/pdfmake.
import pdfMake = require('pdfmake');
import { LayoutModel } from '../layout/cartao-layout';

// Payload mínimo do QR (só o que o api precisa) — quanto menor, menos denso e mais fácil de
// ler numa foto. O api valida apenas simuladoId + cartaoCode.
export interface QrPayload {
  simuladoId: string;
  cartaoCode: string;
}
export interface HeaderData {
  nomeSimulado: string;
  simuladoId: string;
  nomeProva?: string;
  nomeCursinho?: string;
  qrPayload: QrPayload;
}

const K = 72 / 300; // px(300dpi) → pt
const pt = (px: number) => px * K;

// y (em pt) pra centralizar VERTICALMENTE um texto de fontSize `f` (pt) num centro `cyPx` (px).
// absolutePosition.y é o topo do texto; o fator ~0.55·f alinha o miolo do glifo ao centro.
const centerTextY = (cyPx: number, f: number) => pt(cyPx) - f * 0.55;

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

// Layout do cabeçalho (px, relativos ao headerBox). Hierarquia visual:
// logo → título do simulado → dados do aluno (nome + matrícula). Badge do cartão no canto
// superior direito, à esquerda do QR. Nome/matrícula são manuscritos (não lidos pelo OMR).
const LOGO_W = 440;
const LOGO_H = Math.round((LOGO_W * 62) / 296); // mantém a proporção da logo

// Título do simulado (destaque principal), abaixo da logo
const HEADER_TITLE_DY = LOGO_H + 48;
const HEADER_TITLE_FONT = 21;

// Campo "Nome do Estudante": rótulo + linha de preenchimento
const NOME_LABEL_DY = HEADER_TITLE_DY + 120;
const NOME_LINE_DY = NOME_LABEL_DY + 72;
const NOME_LINE_W = 1250;

// Campo "Matrícula (8 dígitos)": rótulo + 8 quadros separados (escrita à mão)
const MAT_LABEL_DY = NOME_LINE_DY + 96;
const MAT_BOXES_DY = MAT_LABEL_DY + 50; // topo dos quadros
const MAT_BOX_W = 70;
const MAT_BOX_H = 88;
const MAT_BOX_GAP = 22;
const MAT_BOX_COUNT = 8;

// Badge do cartão (canto sup. direito, independente do QR): "CARTÃO" pequeno + "#NNN" grande
const BADGE_W = 360;
const BADGE_H = 245;
const BADGE_PAGE_MARGIN = 150; // vão entre o badge e a borda DIREITA da página

// Área de instruções (abaixo dos campos do aluno, à esquerda). O QR fica à direita, na mesma
// faixa vertical — ver DEFAULT_CONFIG.qrBox. Lista com marcadores, compacta.
const INSTR_TITLE_DY = MAT_BOXES_DY + MAT_BOX_H + 120; // abaixo dos quadros da matrícula
const INSTR_TITLE_FONT = 13;
const INSTR_LIST_DY = INSTR_TITLE_DY + 66;
const INSTR_LINE_H = 54; // altura de linha da lista (px)
const INSTR_FONT = 10.5;
const INSTR_ITEM_GAP = 16; // respiro entre itens (px)
const INSTR_BULLET_INDENT = 34; // recuo do texto após o "•" (px)
const INSTR_MAX_CHARS = 58; // quebra de linha (mantém as instruções à esquerda do QR)

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
  const padBottom = 28; // folga abaixo da última linha (px) — pra não colar na borda
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
  if (!layout.page.incluirMatricula) return [];
  if (!layout.page.matriculaBox) return [];
  const b = matriculaBounds(layout);
  const { mat, bw, ox, oy, hwTop, boxLeft, boxRight, boxTop, boxBottom } = b;
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

  // Matrícula: 8 dígitos × 10 valores (0-9) — só quando o cartão inclui matrícula
  if (layout.page.incluirMatricula) {
    draw('matricula', 8, 10);
  }

  // Respostas: colunas de questões × 5 opções (A-E)
  layout.fieldBlocks
    .filter((b) => b.key.startsWith('respostas_c'))
    .forEach((b) => {
      const [first, last] = parseRange(b.fieldLabels[0]);
      draw(b.key, last - first + 1, 5);
    });

  return out;
}

// Formas do cabeçalho no canvas: linha do nome, 8 quadros da matrícula e o badge do cartão.
function collectHeaderShapes(layout: LayoutModel): unknown[] {
  const hb = layout.page.headerBox;
  const out: unknown[] = [];

  // Linha de preenchimento do NOME
  const nomeLineY = hb.y + NOME_LINE_DY;
  out.push({
    type: 'line',
    x1: pt(hb.x),
    y1: pt(nomeLineY),
    x2: pt(hb.x + NOME_LINE_W),
    y2: pt(nomeLineY),
    lineWidth: 1,
    lineColor: '#000000',
  });

  // 8 quadros da MATRÍCULA (separados, escrita à mão — não lidos pelo OMR)
  const boxesY = hb.y + MAT_BOXES_DY;
  for (let i = 0; i < MAT_BOX_COUNT; i++) {
    const x = hb.x + i * (MAT_BOX_W + MAT_BOX_GAP);
    out.push({
      type: 'rect',
      x: pt(x),
      y: pt(boxesY),
      w: pt(MAT_BOX_W),
      h: pt(MAT_BOX_H),
      r: pt(6),
      lineWidth: 1.2,
      lineColor: '#444444',
    });
  }

  // Badge do cartão (canto sup. direito, à esquerda do QR)
  const badgeLeft = layout.page.pageWidthPx - BADGE_PAGE_MARGIN - BADGE_W;
  out.push({
    type: 'rect',
    x: pt(badgeLeft),
    y: pt(hb.y),
    w: pt(BADGE_W),
    h: pt(BADGE_H),
    r: pt(14),
    lineWidth: 2,
    lineColor: '#222222',
  });

  return out;
}

function collectLabels(layout: LayoutModel, header: HeaderData): unknown[] {
  const items: unknown[] = [];

  // Cabeçalho (a logo é imagem; badge/quadros/linha são canvas — ver collectHeaderShapes).
  const hb = layout.page.headerBox;

  // Título do simulado — destaque principal
  items.push({
    text: header.nomeSimulado,
    absolutePosition: { x: pt(hb.x), y: pt(hb.y + HEADER_TITLE_DY) },
    fontSize: HEADER_TITLE_FONT,
    bold: true,
  });

  // Rótulo do campo NOME
  items.push({
    text: 'NOME DO ESTUDANTE:',
    absolutePosition: { x: pt(hb.x), y: pt(hb.y + NOME_LABEL_DY) },
    fontSize: 11,
    bold: true,
  });

  // Rótulo do campo MATRÍCULA
  items.push({
    text: 'MATRÍCULA (8 DÍGITOS):',
    absolutePosition: { x: pt(hb.x), y: pt(hb.y + MAT_LABEL_DY) },
    fontSize: 11,
    bold: true,
  });

  // Badge do cartão: "CARTÃO" pequeno em cima, "#NNN" grande embaixo, centralizados na caixa.
  // Número dinâmico (padStart garante só o mínimo de 3 dígitos) — centralização estimada na mão.
  const badgeLeft = layout.page.pageWidthPx - BADGE_PAGE_MARGIN - BADGE_W;
  const badgeCenterX = badgeLeft + BADGE_W / 2;
  const cartaoFont = 11;
  const cartaoW = 'CARTÃO'.length * cartaoFont * 0.62; // pt, estimativa (bold)
  items.push({
    text: 'CARTÃO',
    absolutePosition: {
      x: pt(badgeCenterX) - cartaoW / 2,
      y: pt(hb.y + 44),
    },
    fontSize: cartaoFont,
    bold: true,
  });
  const numeroText = `#${header.qrPayload.cartaoCode.padStart(3, '0')}`;
  const numeroFont = 28;
  const numeroW = numeroText.length * numeroFont * 0.6; // pt, estimativa (bold)
  items.push({
    text: numeroText,
    absolutePosition: {
      x: pt(badgeCenterX) - numeroW / 2,
      y: pt(hb.y + 108),
    },
    fontSize: numeroFont,
    bold: true,
  });

  // Matrícula digit labels (0-9 à esquerda; e também à direita quando o container está ligado)
  // — só quando o cartão inclui matrícula.
  if (layout.page.incluirMatricula) {
    const mat = layout.fieldBlocks.find((b) => b.key === 'matricula')!;
    const matBw = layout.page.bubbleWidthPx;
    for (let j = 0; j < 10; j++) {
      const c = layout.bubbleCenter('matricula', 0, j);
      items.push({
        text: String(j),
        absolutePosition: { x: pt(mat.origin[0] - 55), y: centerTextY(c.y, 8) },
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
          absolutePosition: {
            x: pt(c.x + matBw / 2 + 12),
            y: centerTextY(c.y, 8),
          },
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
  }

  // Instruções (abaixo dos campos do aluno, à esquerda). Título + lista com marcadores.
  if (layout.page.instructionsBox) {
    const x0 = hb.x;
    items.push({
      text: 'INSTRUÇÕES',
      absolutePosition: { x: pt(x0), y: pt(hb.y + INSTR_TITLE_DY) },
      fontSize: INSTR_TITLE_FONT,
      bold: true,
    });
    const instrucoes = [
      'Preencha completamente o círculo referente à alternativa escolhida.',
      'Use caneta esferográfica de tinta preta ou azul-escura.',
      'Marque apenas uma alternativa por questão.',
      'Não faça marcas fora dos círculos.',
      'Evite rasuras e não dobre este cartão.',
    ];
    let y = hb.y + INSTR_LIST_DY;
    for (const item of instrucoes) {
      const lines = wrapText(item, INSTR_MAX_CHARS);
      items.push({
        text: '•',
        absolutePosition: { x: pt(x0), y: pt(y) },
        fontSize: INSTR_FONT,
      });
      lines.forEach((ln, li) => {
        items.push({
          text: ln,
          absolutePosition: {
            x: pt(x0 + INSTR_BULLET_INDENT),
            y: pt(y + li * INSTR_LINE_H),
          },
          fontSize: INSTR_FONT,
        });
      });
      y += lines.length * INSTR_LINE_H + INSTR_ITEM_GAP;
    }
  }

  // Legenda do QR (abaixo dele, centralizada na largura do QR, em 2 linhas).
  const qr = layout.page.qrBox;
  const qrCenterX = qr.x + qr.size / 2;
  const capFont = 9;
  const capLines = wrapText(
    'Este QR Code identifica este cartão resposta.',
    24,
  );
  capLines.forEach((ln, li) => {
    const w = ln.length * capFont * 0.5; // pt, estimativa
    items.push({
      text: ln,
      absolutePosition: {
        x: pt(qrCenterX) - w / 2,
        y: pt(qr.y + qr.size + 12 + li * 34),
      },
      fontSize: capFont,
    });
  });

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
            y: centerTextY(c.y, OPT_FONT),
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
  // margin = quiet zone (módulos brancos ao redor) — essencial pra leitura por câmera.
  // errorCorrectionLevel 'H' = 30% de recuperação (robusto a foto/inclinação/manchas).
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(header.qrPayload), {
    margin: 4,
    errorCorrectionLevel: 'H',
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
