import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Prova } from '../../prova/prova.schema';
import { resolveQuestaoId } from '../../prova/helpers/question-container.helpers';
import { Simulado } from '../../simulado/schemas/simulado.schema';
import { Questao } from '../questao.schema';
import { Anulacao } from './anulacao.schema';

export interface EscritaDaAnulacao {
  provaId: string;
  questaoId: string;
  /**
   * `true` em anular/desanular: a nota muda, a revisão sobe (R3). `false` ao só
   * editar motivo/justificativa, e ao copiar a anulação para outra prova
   * (duplicar), onde não há nota calculada a invalidar.
   */
  subirRevisao: boolean;
  session?: ClientSession;
}

export interface ResultadoDaEscrita {
  numero: number | null;
  /** Os simulados DA PROVA que têm a questão — e foram escritos. */
  simuladoIds: string[];
}

/**
 * O ÚNICO escritor da anulação (tickets/042, card 01): o slot na prova, o slot
 * em cada simulado da prova e o espelho `Questao.anulacoes`, sempre juntos.
 *
 * ⚠️ **Todas as escritas recebem a mesma `session`.** Quem chama abre a
 * transação; um erro no meio aborta tudo, e o espelho nunca diverge do
 * container. Em sequência, nunca `Promise.all` (o Mongo recusa operações
 * paralelas na mesma sessão — ver `addQuestionSimulados`).
 *
 * ⚠️ Só os simulados **desta prova** (`prova.simulados`): a mesma questão pode
 * estar em simulados de outra prova, onde não está anulada (D1).
 */
@Injectable()
export class AnulacaoRepository {
  constructor(
    @InjectModel(Prova.name) private readonly provaModel: Model<Prova>,
    @InjectModel(Simulado.name) private readonly simuladoModel: Model<Simulado>,
    @InjectModel(Questao.name) private readonly questaoModel: Model<Questao>,
  ) {}

  /** Anula (ou reescreve a anulação existente) da questão nesta prova. */
  async gravar(
    escrita: EscritaDaAnulacao,
    anulacao: Anulacao,
  ): Promise<ResultadoDaEscrita> {
    return this.escrever(
      escrita,
      {
        $set: { 'questoes.$[alvo].anulacao': anulacao },
      },
      (numero) => ({
        ...anulacao,
        provaId: escrita.provaId,
        numero,
      }),
    );
  }

  /** Desanula a questão nesta prova. */
  async limpar(escrita: EscritaDaAnulacao): Promise<ResultadoDaEscrita> {
    return this.escrever(
      escrita,
      { $unset: { 'questoes.$[alvo].anulacao': '' } },
      null,
    );
  }

  /**
   * Só o espelho — para quem tira a questão do container por outro caminho
   * (remover da prova, excluir a questão): a anulação do slot sai junto com o
   * slot, mas a entrada no espelho ficaria órfã.
   */
  async limparEspelho(
    questaoId: string,
    provaId: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.questaoModel
      .updateOne(
        { _id: new Types.ObjectId(questaoId) },
        { $pull: { anulacoes: { provaId } } },
        { session },
      )
      .exec();
  }

  /** O slot da questão na prova — ou `undefined` se ela não está lá. */
  async slotNaProva(
    provaId: string,
    questaoId: string,
    session?: ClientSession,
  ): Promise<
    | { numero: number | null; anulacao?: Anulacao; simuladoIds: string[] }
    | undefined
  > {
    const prova = await this.provaModel
      .findById(provaId, { questoes: 1, simulados: 1 }, { session })
      .lean()
      .exec();
    if (!prova) throw new NotFoundException('Prova não encontrada.');
    const slot = (prova.questoes ?? []).find(
      (qc) => resolveQuestaoId(qc as never) === questaoId,
    );
    if (!slot) return undefined;
    return {
      numero: slot.numero ?? null,
      anulacao: slot.anulacao,
      simuladoIds: ((prova.simulados ?? []) as unknown[]).map(String),
    };
  }

  private async escrever(
    escrita: EscritaDaAnulacao,
    noSlot: Record<string, unknown>,
    espelho: ((numero: number | null) => Record<string, unknown>) | null,
  ): Promise<ResultadoDaEscrita> {
    const { provaId, questaoId, subirRevisao, session } = escrita;
    const slot = await this.slotNaProva(provaId, questaoId, session);
    if (!slot) throw new NotFoundException('A questão não está nesta prova.');

    const qid = new Types.ObjectId(questaoId);
    const filtroDoSlot = { 'questoes.questao': qid };
    const opcoes = { arrayFilters: [{ 'alvo.questao': qid }], session };

    await this.provaModel
      .updateOne(
        { _id: new Types.ObjectId(provaId), ...filtroDoSlot },
        noSlot,
        opcoes,
      )
      .exec();

    const comAQuestao = await this.simuladoModel
      .find(
        {
          _id: { $in: slot.simuladoIds.map((id) => new Types.ObjectId(id)) },
          ...filtroDoSlot,
        },
        { _id: 1 },
        { session },
      )
      .lean()
      .exec();
    const simuladoIds = comAQuestao.map((s) => String(s._id));
    for (const id of simuladoIds) {
      await this.simuladoModel
        .updateOne(
          { _id: new Types.ObjectId(id) },
          subirRevisao ? { ...noSlot, $inc: { revisaoAnulacao: 1 } } : noSlot,
          opcoes,
        )
        .exec();
    }

    // Espelho: tira a entrada desta prova e, se for anular, põe a nova. Duas
    // escritas porque `$pull` e `$push` no mesmo campo não cabem num update.
    await this.questaoModel
      .updateOne(
        { _id: qid },
        { $pull: { anulacoes: { provaId } } },
        { session },
      )
      .exec();
    if (espelho) {
      await this.questaoModel
        .updateOne(
          { _id: qid },
          { $push: { anulacoes: espelho(slot.numero) } },
          { session },
        )
        .exec();
    }

    return { numero: slot.numero, simuladoIds };
  }
}
