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

@Injectable()
export class TemplateProvisionService {
  constructor(
    private readonly simuladoService: SimuladoService,
    private readonly cartaoService: CartaoRespostaService,
    private readonly storage: StorageService,
  ) {}

  async obterPdf(simuladoId: string): Promise<Buffer> {
    const simulado = await this.simuladoService.getById(simuladoId);
    if (!simulado) throw new NotFoundException('simulado não encontrado');

    const N = simulado.categoria?.quantidadeTotalQuestao;
    if (N == null)
      throw new BadRequestException('categoria sem total de questões');

    const seq = await this.simuladoService.incrementarCartaoSeq(simuladoId);

    const { templateJson, configJson, pdfBuffer } =
      await this.cartaoService.gerar(N, {
        nomeSimulado: simulado.nome,
        simuladoId,
        qrPayload: {
          simuladoId,
          cursinhoId: simulado.cursinhoId ?? '',
          cartaoCode: String(seq),
          templateVersion: 'v1',
        },
      });

    if (!(await this.storage.exists(keyTemplate(simuladoId)))) {
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
    }

    return pdfBuffer;
  }
}
