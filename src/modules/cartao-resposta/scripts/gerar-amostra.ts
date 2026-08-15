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
  simuladoId: 'spike',
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

/**
 * Avisa se algum fieldBlock passa da caixa útil (pageDimensions) — ex.: N grande demais
 * (o suportado é até 90). Não impede a geração; só alerta que o cartão vai ficar cortado.
 */
function warnIfOverflow(templateJson: {
  pageDimensions: [number, number];
  bubbleDimensions: [number, number];
  fieldBlocks: Record<
    string,
    {
      fieldType: string;
      origin: [number, number];
      fieldLabels: string[];
      labelsGap: number;
      bubblesGap: number;
    }
  >;
}): void {
  const [pw, ph] = templateJson.pageDimensions;
  const [bw, bh] = templateJson.bubbleDimensions;
  for (const [key, b] of Object.entries(templateJson.fieldBlocks)) {
    const nValues = b.fieldType === 'QTYPE_INT' ? 10 : 5;
    const m = b.fieldLabels[0].match(/[a-z]+(\d+)\.\.(\d+)/i);
    const nLabels = m ? parseInt(m[2], 10) - parseInt(m[1], 10) + 1 : 1;
    // QTYPE_INT: valores descem (bubblesGap), labels atravessam (labelsGap); MCQ5 é o inverso.
    const vertical = b.fieldType === 'QTYPE_INT';
    const right =
      b.origin[0] +
      (vertical ? nLabels - 1 : nValues - 1) *
        (vertical ? b.labelsGap : b.bubblesGap) +
      bw;
    const bottom =
      b.origin[1] +
      (vertical ? nValues - 1 : nLabels - 1) *
        (vertical ? b.bubblesGap : b.labelsGap) +
      bh;
    if (right > pw || bottom > ph) {
      console.warn(
        `⚠️  bloco '${key}' passa da área útil (direita=${right}/${pw}, baixo=${bottom}/${ph}). ` +
          `O cartão suporta até 90 questões; reduza N ou ajuste o layout no config.`,
      );
    }
    // origem negativa = bloco à esquerda/acima da caixa dos markers → o OMR corta a leitura.
    // Comum no modo respostasEvenColumns quando os markers estão afastados demais.
    if (b.origin[0] < 0 || b.origin[1] < 0) {
      console.warn(
        `⚠️  bloco '${key}' começa fora da caixa dos markers (origin=${b.origin[0]},${b.origin[1]}). ` +
          `Aproxime os markers da borda (markerInsetPx menor) ou estreite as colunas.`,
      );
    }
  }
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
  warnIfOverflow(art.templateJson);

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
