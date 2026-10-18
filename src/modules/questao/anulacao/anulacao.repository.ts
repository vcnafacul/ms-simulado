import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Prova } from '../../prova/prova.schema';
import { resolveQuestaoId } from '../../prova/helpers/question-container.helpers';
import { Simulado } from '../../simulado/schemas/simulado.schema';
import { Questao } from '../questao.schema';
import { Anulacao, AnulacaoNaProva } from './anulacao.schema';

/**
 * Move as entradas do espelho de `de` para `para`, só nas provas que trocaram
 * o ponteiro (nova versão, card 26; aplicar versão, 023/14). O slot já ficou
 * anulado — a troca mexe só em `questao` —, então o espelho tem de acompanhar:
 * "anulada em X" passa a ser da sucessora em X, e a original fica só com as
 * provas que a mantiveram (tickets/042, card 04).
 *
 * ⚠️ Mover, nunca copiar: a original não está mais em X.
 */
export async function moverEspelho(
  questaoModel: Model<Questao>,
  de: string,
  para: string,
  provaIds: string[],
  session?: ClientSession,
): Promise<void> {
  if (!provaIds.length || de === para) return;
  const original = await questaoModel
    .findById(de, { anulacoes: 1 }, { session })
    .lean()
    .exec();
  const mover = (original?.anulacoes ?? []).filter((a) =>
    provaIds.includes(a.provaId),
  );
  if (!mover.length) return;
  await questaoModel
    .updateOne(
      { _id: new Types.ObjectId(de) },
      { $pull: { anulacoes: { provaId: { $in: provaIds } } } },
      { session },
    )
    .exec();
  await questaoModel
    .updateOne(
      { _id: new Types.ObjectId(para) },
      { $pull: { anulacoes: { provaId: { $in: provaIds } } } },
      { session },
    )
    .exec();
  await questaoModel
    .updateOne(
      { _id: new Types.ObjectId(para) },
      { $push: { anulacoes: { $each: mover } } },
      { session },
    )
    .exec();
}

/** O que o aviso ao adicionar e o modal da questão mostram (card 04). */
export interface AnulacaoDaQuestao {
  provaId: string;
  provaNome: string | null;
  numero: number | null;
  motivo: string;
  justificativa: string;
  em: Date;
}

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

  /**
   * Põe no espelho as anulações de uma prova que nasceu já com slots anulados
   * (duplicar prova, 027) — o container foi escrito por quem chamou.
   */
  async adicionarAoEspelho(
    entradas: { questaoId: string; entrada: AnulacaoNaProva }[],
    session?: ClientSession,
  ): Promise<void> {
    for (const { questaoId, entrada } of entradas) {
      await this.questaoModel
        .updateOne(
          { _id: new Types.ObjectId(questaoId) },
          { $push: { anulacoes: entrada } },
          { session },
        )
        .exec();
    }
  }

  /**
   * As anulações da questão, com o nome da prova (card 04). Prova excluída ou
   * que não existe mais sai da lista: o espelho pode ter ficado para trás nela.
   */
  async daQuestao(questaoId: string): Promise<AnulacaoDaQuestao[]> {
    const q = await this.questaoModel
      .findById(questaoId, { anulacoes: 1 })
      .lean()
      .exec();
    const anulacoes = q?.anulacoes ?? [];
    if (!anulacoes.length) return [];
    const provas = await this.provaModel
      .find(
        {
          _id: { $in: anulacoes.map((a) => new Types.ObjectId(a.provaId)) },
          deleted: { $ne: true },
        },
        { nome: 1 },
      )
      .lean()
      .exec();
    const nome = new Map(provas.map((p) => [String(p._id), p.nome ?? null]));
    return anulacoes
      .filter((a) => nome.has(a.provaId))
      .map((a) => ({
        provaId: a.provaId,
        provaNome: nome.get(a.provaId) ?? null,
        numero: a.numero ?? null,
        motivo: a.motivo,
        justificativa: a.justificativa,
        em: a.em,
      }));
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
