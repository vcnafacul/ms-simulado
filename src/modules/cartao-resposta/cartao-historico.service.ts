import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { parseSimuladoId } from './imagekey.util';
import { OmrHttpService } from './omr-http.service';

@Injectable()
export class CartaoHistoricoService {
  private readonly logger = new Logger(CartaoHistoricoService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly omrHttp: OmrHttpService,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
  ) {}

  async criar(dto: {
    usuario: string;
    imageKey: string;
    cartaoCode: string;
    cursinhoId?: string;
    turmaId?: string;
  }): Promise<{ historicoId: string }> {
    const simuladoId = parseSimuladoId(dto.imageKey);

    if (
      await this.historicoRepository.existsCartaoAtivo(
        dto.usuario,
        simuladoId,
        dto.cartaoCode,
      )
    ) {
      throw new ConflictException('cartão já enviado para este usuário');
    }

    const historico = await this.historicoRepository.createAwaitingOmr({
      usuario: dto.usuario,
      simuladoId,
      imageKey: dto.imageKey,
      cartaoCode: dto.cartaoCode,
    });
    const historicoId = (
      historico as unknown as { _id: { toString(): string } }
    )._id.toString();

    await this.vincularAoCursinho(historicoId, simuladoId, dto);

    try {
      await this.omrHttp.enviarProcessamento(dto.imageKey);
    } catch (err) {
      await this.historicoRepository.marcarFalha(
        historicoId,
        CodigoFalhaInterno.OmrIndisponivel,
        err instanceof Error ? err.message : String(err),
      );
      throw new BadGatewayException('falha ao acionar o OMR');
    }

    return { historicoId };
  }

  /**
   * Escrita sequencial, não transacional: o compose de dev sobe um Mongo standalone,
   * e uma transação aqui quebraria o ambiente local de quem não soubesse.
   *
   * O preço é uma linha órfã possível. Ela é RECUPERÁVEL — o vínculo continua no
   * MySQL — mas só se deixar rastro: um cartão fora do relatório sem nada no log é
   * o chamado que ninguém reproduz.
   */
  private async vincularAoCursinho(
    historicoId: string,
    simuladoId: string,
    dto: { usuario: string; cursinhoId?: string; turmaId?: string },
  ): Promise<void> {
    if (!dto.cursinhoId) {
      this.logger.warn(
        `histórico ${historicoId} criado SEM cursinhoId — ficará fora de todo relatório de cursinho`,
      );
      return;
    }
    try {
      await this.relatorioRepository.criar({
        historicoId,
        simuladoId,
        usuario: dto.usuario,
        cursinhoId: dto.cursinhoId,
        turmaId: dto.turmaId,
      });
    } catch (err) {
      this.logger.error(
        `histórico ${historicoId} criado mas NÃO vinculado ao cursinho ${dto.cursinhoId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
