import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { CriarHistoricoCartaoDtoInput } from './dtos/criar-historico-cartao.dto.input';
import { parseSimuladoId } from './imagekey.util';
import { OmrHttpService } from './omr-http.service';

/**
 * ⚠️ O falho diz o que fazer: o caminho é o "Reenviar" do relatório, que
 * reabre O MESMO histórico — não um envio novo.
 */
export function textoDeCartaoJaEnviado(status?: HistoricoStatus): string {
  if (status === HistoricoStatus.Failed) {
    return 'Este cartão já foi enviado para este estudante e a leitura falhou. Use "Reenviar" no relatório do simulado.';
  }
  return 'Este cartão já foi enviado para este estudante.';
}

@Injectable()
export class CartaoHistoricoService {
  private readonly logger = new Logger(CartaoHistoricoService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly omrHttp: OmrHttpService,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
  ) {}

  async criar(
    dto: CriarHistoricoCartaoDtoInput,
  ): Promise<{ historicoId: string }> {
    const simuladoId = parseSimuladoId(dto.imageKey);

    const jaEnviado = await this.historicoRepository.buscarCartaoEnviado(
      dto.usuario,
      simuladoId,
      dto.cartaoCode,
    );
    if (jaEnviado) {
      throw new ConflictException(textoDeCartaoJaEnviado(jaEnviado.status));
    }

    // ⚠️ Cunhado e GRAVADO antes do POST: se o token fosse gravado depois, um
    // callback rápido chegaria antes da escrita e seria descartado por não
    // bater com nada.
    const tentativaId = randomUUID();

    const historico = await this.historicoRepository
      .createAwaitingOmr({
        usuario: dto.usuario,
        simuladoId,
        imageKey: dto.imageKey,
        cartaoCode: dto.cartaoCode,
        tentativaId,
      })
      .catch((err: unknown) => {
        // A corrida que passou pela consulta: o índice `cartao_por_estudante`
        // recusa, e vira o mesmo 409.
        if ((err as { code?: number })?.code === 11000) {
          throw new ConflictException(textoDeCartaoJaEnviado());
        }
        throw err;
      });
    const historicoId = (
      historico as unknown as { _id: { toString(): string } }
    )._id.toString();

    await this.vincularAoCursinho(historicoId, simuladoId, dto);

    try {
      await this.omrHttp.enviarProcessamento(dto.imageKey, tentativaId);
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
      await this.relatorioRepository.registrar({
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
