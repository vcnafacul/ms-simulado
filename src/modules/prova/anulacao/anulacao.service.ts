import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import { AuditLogService } from '../../auditLog/auditLog.service';
import { Anulacao } from '../../questao/anulacao/anulacao.schema';
import {
  AnulacaoRepository,
  ResultadoDaEscrita,
} from '../../questao/anulacao/anulacao.repository';
import { QuestaoRepository } from '../../questao/questao.repository';
import { AnularQuestaoDTOInput } from '../dtos/anular-questao.dto.input';
import {
  motivoParaNaoComporProva,
  podeAnularNaProva,
} from '../helpers/pode-compor-prova';
import { ProvaRepository } from '../prova.repository';

/*
 * ⚠️ A guarda D10 (recusar anular em prova já aplicada) saiu no card 12:
 * agora a nota velha tem caminho de correção — o relatório mostra a
 * divergência e o "Recalcular".
 */

export interface ResultadoDaAnulacao extends ResultadoDaEscrita {
  acao: 'anular' | 'desanular' | 'editarAnulacao' | 'nada';
  anulacao: Anulacao | null;
}

/**
 * Anular e desanular uma questão numa prova (tickets/042, card 03).
 *
 * ⚠️ **Nada é processado e nada é avisado** (D6, D7): nem recálculo, nem fila,
 * nem push. Anular só sobe a revisão; quem recalcula é o relatório.
 */
@Injectable()
export class AnulacaoService {
  constructor(
    private readonly provas: ProvaRepository,
    private readonly anulacoes: AnulacaoRepository,
    private readonly questoes: QuestaoRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async anular(
    provaId: string,
    questaoId: string,
    dto: AnularQuestaoDTOInput,
    ator?: Ator,
  ): Promise<ResultadoDaAnulacao> {
    await this.assertPodeAnular(provaId, ator);
    const slot = await this.slotOu404(provaId, questaoId);
    // Editar motivo/justificativa: a nota é a mesma, a revisão não sobe (R3).
    const editando = !!slot.anulacao;

    const anulacao: Anulacao = {
      motivo: dto.motivo,
      justificativa: dto.justificativa,
      // Na edição, o "quando" e o "quem" da anulação original ficam.
      em: slot.anulacao?.em ?? new Date(),
      porUsuarioId: slot.anulacao?.porUsuarioId ?? ator?.userId ?? null,
      porCursinhoId: slot.anulacao?.porCursinhoId ?? ator?.cursinhoId ?? null,
    };
    const r = await this.emTransacao((session) =>
      this.anulacoes.gravar(
        { provaId, questaoId, subirRevisao: !editando, session },
        anulacao,
      ),
    );
    const acao = editando ? 'editarAnulacao' : 'anular';
    await this.auditar(acao, provaId, questaoId, r, ator, {
      motivo: dto.motivo,
      justificativa: dto.justificativa,
      ...(editando
        ? {
            antes: {
              motivo: slot.anulacao!.motivo,
              justificativa: slot.anulacao!.justificativa,
            },
          }
        : {}),
    });
    return { ...r, acao, anulacao };
  }

  async desanular(
    provaId: string,
    questaoId: string,
    ator?: Ator,
  ): Promise<ResultadoDaAnulacao> {
    await this.assertPodeAnular(provaId, ator);
    const slot = await this.slotOu404(provaId, questaoId);
    // Já válida: nada a fazer. Subir a revisão aqui marcaria divergente um
    // relatório que não mudou.
    if (!slot.anulacao) {
      return {
        acao: 'nada',
        anulacao: null,
        numero: slot.numero,
        simuladoIds: [],
      };
    }
    const r = await this.emTransacao((session) =>
      this.anulacoes.limpar({
        provaId,
        questaoId,
        subirRevisao: true,
        session,
      }),
    );
    await this.auditar('desanular', provaId, questaoId, r, ator, {
      motivo: slot.anulacao.motivo,
      justificativa: slot.anulacao.justificativa,
    });
    return { ...r, acao: 'desanular', anulacao: null };
  }

  private async assertPodeAnular(provaId: string, ator?: Ator) {
    const prova = await this.provas.getDonoDaProva(provaId);
    if (!prova || (await this.provas.estaExcluida(provaId))) {
      throw new NotFoundException('Prova não encontrada.');
    }
    if (!podeAnularNaProva(prova, ator)) {
      throw new ForbiddenException(motivoParaNaoComporProva(prova, ator));
    }
  }

  private async slotOu404(provaId: string, questaoId: string) {
    const slot = await this.anulacoes.slotNaProva(provaId, questaoId);
    if (!slot) throw new NotFoundException('A questão não está nesta prova.');
    return slot;
  }

  private async emTransacao<T>(
    escrever: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.questoes.startSession();
    session.startTransaction();
    try {
      const r = await escrever(session);
      await session.commitTransaction();
      return r;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async auditar(
    acao: string,
    provaId: string,
    questaoId: string,
    r: ResultadoDaEscrita,
    ator: Ator | undefined,
    extra: Record<string, unknown>,
  ) {
    await this.auditLog.create({
      user: ator?.userId,
      entityId: questaoId,
      entityType: 'Questao',
      changes: JSON.stringify({
        acao,
        provaId,
        numero: r.numero,
        simulados: r.simuladoIds,
        cursinhoId: ator?.cursinhoId ?? null,
        ...extra,
      }),
    });
  }
}
