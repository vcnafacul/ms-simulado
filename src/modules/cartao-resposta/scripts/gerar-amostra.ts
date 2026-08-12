import * as fs from 'fs';
import * as path from 'path';
import { CartaoRespostaService } from '../cartao-resposta.service';
import { DEFAULT_CONFIG, PageConfig } from '../layout/cartao-layout';
import { HeaderData } from '../pdf/cartao-pdf.builder';

/**
 * Gera os artefatos do cartão (template.json, config.json, omr_marker.png, cartao.pdf)
 * a partir de um arquivo de config JSON — pra iterar no layout sem editar código.
 *
 * Uso:
 *   npx ts-node src/modules/cartao-resposta/scripts/gerar-amostra.ts [configPath] [outDir]
 *   (ou: yarn cartao:preview [configPath] [outDir])
 *
 * configPath default = cartao.config.json (na raiz do ms-simulado). Se não existir,
 *   usa os defaults (N=90, header de amostra, DEFAULT_CONFIG).
 * outDir default = tmp/cartao-amostra.
 *
 * Formato do config (todos os campos opcionais):
 *   { "n": 90, "header": {...}, "layout": { <subset de PageConfig> } }
 * O `layout` é PARCIAL: só o que estiver ali sobrescreve o DEFAULT_CONFIG.
 */

interface CartaoConfigFile {
  n?: number;
  header?: HeaderData;
  layout?: Partial<PageConfig>;
}

const DEFAULT_HEADER: HeaderData = {
  nomeSimulado: 'Simulado de Amostra',
  nomeProva: 'Spike Etapa 7',
  nomeCursinho: 'Cursinho Amostra',
  qrPayload: {
    simuladoId: 'spike',
    cursinhoId: 'spike',
    templateVersion: 'v1',
  },
};

function loadConfig(configPath: string): CartaoConfigFile {
  if (!fs.existsSync(configPath)) {
    console.log(`(sem ${path.basename(configPath)} — usando defaults)`);
    return {};
  }
  const raw = JSON.parse(
    fs.readFileSync(configPath, 'utf-8'),
  ) as CartaoConfigFile;
  // Aviso de typo: chaves de layout que não existem no PageConfig são ignoradas.
  if (raw.layout) {
    const known = new Set(Object.keys(DEFAULT_CONFIG));
    for (const k of Object.keys(raw.layout)) {
      if (!known.has(k)) {
        console.warn(
          `⚠️  layout.${k} não é um campo de PageConfig — ignorado.`,
        );
      }
    }
  }
  return raw;
}

async function main() {
  const configPath = path.resolve(process.argv[2] ?? 'cartao.config.json');
  const outDir = path.resolve(
    process.argv[3] ?? path.join('tmp', 'cartao-amostra'),
  );
  fs.mkdirSync(outDir, { recursive: true });

  const cfgFile = loadConfig(configPath);
  const N = cfgFile.n ?? 90;
  const header = cfgFile.header ?? DEFAULT_HEADER;
  const layout: PageConfig = { ...DEFAULT_CONFIG, ...(cfgFile.layout ?? {}) };

  const service = new CartaoRespostaService();
  const art = await service.gerar(N, header, layout);

  fs.writeFileSync(
    path.join(outDir, 'template.json'),
    JSON.stringify(art.templateJson, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, 'config.json'),
    JSON.stringify(art.configJson, null, 2),
  );
  fs.copyFileSync(art.markerPngPath, path.join(outDir, 'omr_marker.png'));
  fs.writeFileSync(path.join(outDir, 'cartao.pdf'), art.pdfBuffer);
  console.log(`Artefatos (N=${N}) em ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
