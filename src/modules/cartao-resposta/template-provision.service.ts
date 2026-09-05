import {
  ConflictException,
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

    // Só simulado PRONTO gera cartão. bloqueado=false é auto-calculado como
    // (atingiu a quantidade total da categoria) E (todas as questões aprovadas) →
    // garante numeros completos e contíguos. Simulado incompleto = bloqueado = 409.
    if (simulado.bloqueado)
      throw new ConflictException(
        'simulado não está pronto (questões pendentes ou incompletas)',
      );

    // O `numero` de cada questão é a identidade real dela no simulado (ex.: bloco 46..90).
    // O cartão imprime esses numeros (não 1..N) pra o OMR/callback casarem por numero.
    const numeros = simulado.questoes.map((q) => q.numero);
    const N = numeros.length;
    const startNumero = Math.min(...numeros);

    const seq = await this.simuladoService.incrementarCartaoSeq(simuladoId);

    const { templateJson, configJson, pdfBuffer } =
      await this.cartaoService.gerar(
        N,
        {
          nomeSimulado: simulado.nome,
          simuladoId,
          qrPayload: {
            simuladoId,
            cartaoCode: String(seq),
          },
        },
        undefined,
        startNumero,
      );

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
