import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DONO_CURSINHO } from '../categoria/schemas/categoria.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { SimuladoService } from '../simulado/simulado.service';
import { CartaoRespostaService } from './cartao-resposta.service';
import { StorageService } from '../../shared/storage/storage.service';
import { ProvaRepository } from '../prova/prova.repository';

const base = (id: string) => `templates/${id}`;
export const keyTemplate = (id: string) => `${base(id)}/template.json`;
export const keyConfig = (id: string) => `${base(id)}/config.json`;

@Injectable()
export class TemplateProvisionService {
  constructor(
    private readonly simuladoService: SimuladoService,
    private readonly cartaoService: CartaoRespostaService,
    private readonly storage: StorageService,
    private readonly provas: ProvaRepository,
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
    // tickets/038 (R8a): o QR leva a prova do simulado (7 de 134 simulados em
    // homol não estão em prova — aí vai sem).
    const prova = await this.provas.buscarProvaDoSimulado(simuladoId);

    const { templateJson, configJson, pdfBuffer } =
      await this.cartaoService.gerar(
        N,
        {
          nomeSimulado: simulado.nome,
          simuladoId,
          qrPayload: {
            ...(prova ? { provaId: String(prova._id) } : {}),
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

  /**
   * Cartão DA PROVA (tickets/038, R5/R6/R11/R12) — um cartão para os simulados da prova ENEM
   * do cursinho. Dia 1: 1–90 + marcação de idioma; Dia 2: 91–180.
   *
   * - só com TODOS os simulados prontos (`bloqueado = false`);
   * - contador da PROVA (`prova.cartaoSeq`);
   * - QR `{ provaId, cartaoCode }` e template em `templates/<provaId>/` (a foto vai para
   *   `cartoes/<provaId>/…`, card 07).
   */
  async obterPdfDaProva(provaId: string): Promise<Buffer> {
    const prova = await this.provas.getById(provaId);
    if (!prova || (prova as { deleted?: boolean }).deleted) {
      throw new NotFoundException('prova não encontrada');
    }
    if (prova.categoria?.dono !== DONO_CURSINHO) {
      throw new BadRequestException(TEXTO_SO_ENEM_DO_CURSINHO);
    }
    const simulados = (prova.simulados ?? []) as Simulado[];
    if (!simulados.length || simulados.some((s) => s.bloqueado !== false)) {
      throw new ConflictException(TEXTO_SIMULADOS_INCOMPLETOS);
    }

    // De 1 a 5 a prova tem as duas línguas no MESMO número: o cartão tem uma linha por número.
    const numeros = [
      ...new Set(simulados.flatMap((s) => s.questoes.map((q) => q.numero))),
    ];
    const N = numeros.length;
    const startNumero = Math.min(...numeros);
    const idioma = simulados.some((s) => !!s.idioma);

    const seq = await this.provas.incrementarCartaoSeq(provaId);
    const { templateJson, configJson, pdfBuffer } =
      await this.cartaoService.gerar(
        N,
        {
          nomeSimulado: prova.nome,
          simuladoId: provaId,
          qrPayload: { provaId, cartaoCode: String(seq) },
        },
        undefined,
        startNumero,
        { idioma },
      );

    if (!(await this.storage.exists(keyTemplate(provaId)))) {
      await this.storage.putObject(
        keyTemplate(provaId),
        JSON.stringify(templateJson),
        'application/json',
      );
      await this.storage.putObject(
        keyConfig(provaId),
        JSON.stringify(configJson),
        'application/json',
      );
    }
    return pdfBuffer;
  }
}

export const TEXTO_SO_ENEM_DO_CURSINHO =
  'O cartão da prova existe só para as provas Enem Dia 1 e Enem Dia 2 do cursinho.';
export const TEXTO_SIMULADOS_INCOMPLETOS =
  'Todos os simulados da prova precisam estar completos para gerar o cartão da prova.';
