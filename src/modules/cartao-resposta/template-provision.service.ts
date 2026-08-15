import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SimuladoService } from '../simulado/simulado.service';
import { CartaoRespostaService } from './cartao-resposta.service';
import { StorageService } from '../../shared/storage/storage.service';

const base = (id: string) => `templates/${id}`;
export const keyTemplate = (id: string) => `${base(id)}/template.json`;
export const keyConfig = (id: string) => `${base(id)}/config.json`;
export const keyPdf = (id: string) => `${base(id)}/cartao.pdf`;

@Injectable()
export class TemplateProvisionService {
  constructor(
    private readonly simuladoService: SimuladoService,
    private readonly cartaoService: CartaoRespostaService,
    private readonly storage: StorageService,
  ) {}

  async obterPdf(simuladoId: string): Promise<Buffer> {
    if (await this.storage.exists(keyPdf(simuladoId))) {
      return this.storage.get(keyPdf(simuladoId));
    }

    const simulado = await this.simuladoService.getById(simuladoId);
    if (!simulado) throw new NotFoundException('simulado não encontrado');

    const N = simulado.categoria?.quantidadeTotalQuestao;
    if (N == null)
      throw new BadRequestException('categoria sem total de questões');

    const { templateJson, configJson, pdfBuffer } =
      await this.cartaoService.gerar(N, {
        nomeSimulado: simulado.nome,
        simuladoId,
        qrPayload: {
          simuladoId,
          cursinhoId: simulado.cursinhoId ?? '',
          templateVersion: 'v1',
        },
      });

    await this.storage.putObject(
      keyTemplate(simuladoId),
      JSON.stringify(templateJson),
      'application/json',
    );
    await this.storage.putObject(
      keyConfig(simuladoId),
      JSON.stringify(configJson),
      'application/json',
    );
    await this.storage.putObject(
      keyPdf(simuladoId),
      pdfBuffer,
      'application/pdf',
    );

    return pdfBuffer;
  }
}
