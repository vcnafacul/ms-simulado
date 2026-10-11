import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { ProvaRepository } from '../prova/prova.repository';
import { SimuladoRepository } from '../simulado/simulado.repository';
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

/**
 * ⚠️ Card 35: o cartão JÁ ESTÁ gravado (como falho) quando o OMR não responde.
 * Mandar "tentar de novo" levaria ao 409 de "já foi enviado".
 */
export const TEXTO_OMR_INDISPONIVEL =
  'O leitor de cartões está fora do ar. O cartão foi registrado: use "Reenviar" no relatório do simulado quando o serviço voltar.';

/**
 * O id no caminho da foto (`cartoes/<id>/…`) é o que o ms-omr usa para achar o
 * template. Se ele divergir do QR, a folha seria lida com o template errado.
 */
export const TEXTO_CAMINHO_DIVERGE =
  'O caminho da foto não corresponde ao QR do cartão.';

@Injectable()
export class CartaoHistoricoService {
  private readonly logger = new Logger(CartaoHistoricoService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly omrHttp: OmrHttpService,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly provaRepository: ProvaRepository,
  ) {}

  async criar(
    dto: CriarHistoricoCartaoDtoInput,
  ): Promise<{ historicoId: string }> {
    const alvo = await this.resolverAlvo(dto);

    const jaEnviado = alvo.cartaoDaProva
      ? await this.historicoRepository.buscarCartaoDaProvaEnviado(
          dto.usuario,
          alvo.provaId!,
        )
      : await this.historicoRepository.buscarCartaoEnviado(
          dto.usuario,
          alvo.simuladoId!,
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
        simuladoId: alvo.simuladoId,
        provaId: alvo.provaId,
        cartaoDaProva: alvo.cartaoDaProva,
        imageKey: dto.imageKey,
        cartaoCode: dto.cartaoCode,
        tentativaId,
      })
      .catch((err: unknown) => {
        // A corrida que passou pela consulta: o índice único recusa, e vira o
        // mesmo 409.
        if ((err as { code?: number })?.code === 11000) {
          throw new ConflictException(textoDeCartaoJaEnviado());
        }
        throw err;
      });
    const historicoId = (
      historico as unknown as { _id: { toString(): string } }
    )._id.toString();

    /*
      tickets/038: a junção do relatório precisa do simulado. No cartão da
      prova com mais de um simulado (ENEM Dia 1 do cursinho), ele só existe no
      callback — e é lá que a junção é gravada (card 13).
    */
    if (alvo.simuladoId) {
      await this.vincularAoCursinho(historicoId, alvo.simuladoId, dto);
    }

    try {
      await this.omrHttp.enviarProcessamento(dto.imageKey, tentativaId);
    } catch (err) {
      await this.historicoRepository.marcarFalha(
        historicoId,
        CodigoFalhaInterno.OmrIndisponivel,
        err instanceof Error ? err.message : String(err),
      );
      throw new BadGatewayException(TEXTO_OMR_INDISPONIVEL);
    }

    return { historicoId };
  }

  /**
   * De quem é o cartão (tickets/038, R8a):
   * 1. o QR trouxe o simulado → é ele (e a prova é a dele, se houver);
   * 2. o QR trouxe só a prova → cartão DA PROVA: com um simulado, é ele; com
   *    mais, fica vazio até o callback ler o idioma;
   * 3. api antiga (nenhum dos dois) → o id do caminho da `imageKey` é o
   *    simulado (QR antigo).
   *
   * ⚠️ Toda recusa vem antes de escrever.
   */
  private async resolverAlvo(dto: CriarHistoricoCartaoDtoInput): Promise<{
    simuladoId: string | null;
    provaId: string | null;
    cartaoDaProva: boolean;
  }> {
    const doCaminho = parseSimuladoId(dto.imageKey);

    if (dto.provaId && !dto.simuladoId) {
      if (doCaminho !== dto.provaId) {
        throw new BadRequestException(TEXTO_CAMINHO_DIVERGE);
      }
      const prova = await this.provaRepository.buscarParaCartao(dto.provaId);
      if (!prova) {
        throw new BadRequestException(
          'Este cartão é de uma prova que não existe mais.',
        );
      }
      if (prova.cursinhoId && prova.cursinhoId !== dto.cursinhoId) {
        throw new ForbiddenException(
          'Este cartão é de uma prova de outro cursinho.',
        );
      }
      const simulados = (prova.simulados ?? []).map(String);
      return {
        simuladoId: simulados.length === 1 ? simulados[0] : null,
        provaId: dto.provaId,
        cartaoDaProva: true,
      };
    }

    const simuladoId = dto.simuladoId ?? doCaminho;
    if (simuladoId !== doCaminho) {
      throw new BadRequestException(TEXTO_CAMINHO_DIVERGE);
    }
    await this.garantirSimuladoDoCursinho(simuladoId, dto.cursinhoId);
    const daProva =
      await this.provaRepository.buscarProvaDoSimulado(simuladoId);
    const provaId = daProva ? String(daProva._id) : null;
    if (dto.provaId && dto.provaId !== provaId) {
      throw new BadRequestException(
        'O simulado deste cartão não é da prova indicada no QR.',
      );
    }
    return { simuladoId, provaId, cartaoDaProva: false };
  }

  /**
   * Card 35: um QR lido de um simulado apagado (ou de outro cursinho) virava um
   * histórico que nunca chegaria a relatório nenhum — e a tela dizia "QR
   * ilegível". Simulado sem dono (da plataforma) vale para qualquer cursinho.
   */
  private async garantirSimuladoDoCursinho(
    simuladoId: string,
    cursinhoId?: string,
  ): Promise<void> {
    const simulado =
      await this.simuladoRepository.buscarCursinhoDoSimulado(simuladoId);
    if (!simulado) {
      throw new BadRequestException(
        'Este cartão é de um simulado que não existe mais.',
      );
    }
    if (simulado.cursinhoId && simulado.cursinhoId !== cursinhoId) {
      throw new ForbiddenException(
        'Este cartão é de um simulado de outro cursinho.',
      );
    }
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
