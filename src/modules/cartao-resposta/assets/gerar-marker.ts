// Gera um fiducial marker distinto (grayscale de alto contraste) para o cv2.matchTemplate
// do OMRChecker. Quadrado preto com um recorte branco em "L" no canto inferior direito,
// para quebrar simetria e reduzir falsos positivos com texto/bordas.
// Pure-JS (pngjs) — sem node-canvas / libs de sistema.
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

const SIZE = 120; // px (~10mm @ 300dpi)
const png = new PNG({ width: SIZE, height: SIZE });

const set = (x: number, y: number, v: number) => {
  const idx = (SIZE * y + x) << 2;
  png.data[idx] = v;
  png.data[idx + 1] = v;
  png.data[idx + 2] = v;
  png.data[idx + 3] = 255;
};

// L branco (recorte) no canto inferior direito
const inHorizNotch = (x: number, y: number) =>
  x >= SIZE * 0.55 && x < SIZE * 0.9 && y >= SIZE * 0.55 && y < SIZE * 0.7;
const inVertNotch = (x: number, y: number) =>
  x >= SIZE * 0.55 && x < SIZE * 0.7 && y >= SIZE * 0.55 && y < SIZE * 0.9;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const white = inHorizNotch(x, y) || inVertNotch(x, y);
    set(x, y, white ? 255 : 0);
  }
}

const out = path.join(__dirname, 'omr_marker.png');
fs.writeFileSync(out, PNG.sync.write(png));
console.log('marker escrito em', out, `(${SIZE}x${SIZE})`);
