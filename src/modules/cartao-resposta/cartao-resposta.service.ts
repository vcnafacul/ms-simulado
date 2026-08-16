import { Injectable } from '@nestjs/common';
import * as path from 'path';
import {
  buildLayout,
  PageConfig,
  DEFAULT_CONFIG,
} from './layout/cartao-layout';
import {
  buildTemplateJson,
  OmrTemplateJson,
  OmrConfigJson,
} from './template/template-json.builder';
import { buildCartaoPdf, HeaderData } from './pdf/cartao-pdf.builder';

export interface CartaoArtefatos {
  templateJson: OmrTemplateJson;
  configJson: OmrConfigJson;
  markerPngPath: string;
  pdfBuffer: Buffer;
}

@Injectable()
export class CartaoRespostaService {
  async gerar(
    N: number,
    header: HeaderData,
    cfg: PageConfig = DEFAULT_CONFIG,
    startNumero = 1,
  ): Promise<CartaoArtefatos> {
    const layout = buildLayout(N, cfg, startNumero);
    const { templateJson, configJson } = buildTemplateJson(layout);
    const pdfBuffer = await buildCartaoPdf(layout, header);
    return {
      templateJson,
      configJson,
      markerPngPath: path.join(__dirname, 'assets', 'omr_marker.png'),
      pdfBuffer,
    };
  }
}
