import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { HistoricoRepository } from '../historico/historico.repository';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { parseSimuladoId } from './imagekey.util';
import { OmrHttpService } from './omr-http.service';

@Injectable()
export class CartaoHistoricoService {
  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly omrHttp: OmrHttpService,
  ) {}

  async criar(dto: {
    usuario: string;
    imageKey: string;
    cartaoCode: string;
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

    try {
      await this.omrHttp.enviarProcessamento(dto.imageKey);
    } catch {
      await this.historicoRepository.updateStatus(
        historicoId,
        HistoricoStatus.Failed,
      );
      throw new BadGatewayException('falha ao acionar o OMR');
    }

    return { historicoId };
  }
}
