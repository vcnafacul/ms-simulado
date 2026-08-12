import * as fs from 'fs';
import * as path from 'path';
import { CartaoRespostaService } from '../cartao-resposta.service';

async function main() {
  const N = parseInt(process.argv[2] ?? '90', 10);
  const outDir =
    process.argv[3] ?? path.join(process.cwd(), 'tmp', 'cartao-amostra');
  fs.mkdirSync(outDir, { recursive: true });

  const service = new CartaoRespostaService();
  const art = await service.gerar(N, {
    nomeSimulado: 'Simulado de Amostra',
    nomeProva: 'Spike Etapa 7',
    nomeCursinho: 'Cursinho Amostra',
    qrPayload: {
      simuladoId: 'spike',
      cursinhoId: 'spike',
      templateVersion: 'v1',
    },
  });

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
