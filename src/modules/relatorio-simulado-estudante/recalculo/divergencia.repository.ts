import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import {
  filtroDivergente,
  numerosDoSimulado,
} from '../../historico/filtro-divergente';
import { Simulado } from '../../simulado/schemas/simulado.schema';
import { RelatorioSimuladoEstudante } from '../relatorio-simulado-estudante.schema';

export interface HistoricoDivergente {
  _id: Types.ObjectId;
  usuario: string;
  createdAt?: Date;
  respostas: unknown[];
  /** A nota de antes — o push "nota atualizada" compara com a de depois (card 20). */
  acertos?: number;
  totalConsiderado?: number;
}

/** O estado de anulação de um simulado que as consultas usam. */
export interface AnulacaoDoSimulado {
  /** Revisão atual: `0` = nunca anulou nada (atalho, sem consulta). */
  revisao: number;
  /** As anuladas de agora, ordenadas — o lado "atual" da divergência. */
  numeros: number[];
}

/**
 * As consultas da divergência (tickets/042, R3) — sobre as LINHAS do relatório
 * de um cursinho, para o recálculo pegar exatamente o que o relatório mostra.
 *
 * ⚠️ Sempre pelo `filtroDivergente` (card 20): divergente é o histórico
 * calculado com OUTRO conjunto de anuladas — não "revisão atrás". Anular e
 * desanular sem recálculo no meio não deixa ninguém divergente.
 */
@Injectable()
export class DivergenciaRepository {
  constructor(
    @InjectModel(RelatorioSimuladoEstudante.name)
    private readonly linhas: Model<RelatorioSimuladoEstudante>,
    @InjectModel(Simulado.name) private readonly simulados: Model<Simulado>,
  ) {}

  private pipeline(
    simuladoId: string,
    cursinhoId: string,
    numeros: readonly number[],
  ): PipelineStage[] {
    return [
      { $match: { simulado: new Types.ObjectId(simuladoId), cursinhoId } },
      {
        $lookup: {
          from: 'historicos',
          localField: 'historico',
          foreignField: '_id',
          as: 'h',
        },
      },
      { $unwind: '$h' },
      {
        $match: {
          'h.status': HistoricoStatus.Completed,
          ...filtroDivergente(numeros, 'h.'),
        },
      },
    ];
  }

  async contar(
    simuladoId: string,
    cursinhoId: string,
    anulacao: AnulacaoDoSimulado,
  ): Promise<number> {
    if (anulacao.revisao <= 0) return 0;
    const [r] = await this.linhas
      .aggregate([
        ...this.pipeline(simuladoId, cursinhoId, anulacao.numeros),
        { $count: 'n' },
      ])
      .exec();
    return r?.n ?? 0;
  }

  /** Um lote de divergentes, por `_id` crescente depois do cursor. */
  async lote(
    simuladoId: string,
    cursinhoId: string,
    anulacao: AnulacaoDoSimulado,
    depoisDe: Types.ObjectId | null,
    limite: number,
  ): Promise<HistoricoDivergente[]> {
    if (anulacao.revisao <= 0) return [];
    return this.linhas
      .aggregate([
        ...this.pipeline(simuladoId, cursinhoId, anulacao.numeros),
        ...(depoisDe ? [{ $match: { 'h._id': { $gt: depoisDe } } }] : []),
        { $sort: { 'h._id': 1 } },
        { $limit: limite },
        {
          $project: {
            _id: '$h._id',
            usuario: '$h.usuario',
            createdAt: '$h.createdAt',
            respostas: '$h.respostas',
            acertos: '$h.acertos',
            totalConsiderado: '$h.totalConsiderado',
          },
        },
      ])
      .exec();
  }

  /**
   * Os números anulados com que os divergentes foram calculados (união). O que
   * não está anulado agora "voltou a valer" — o aviso do relatório diz isso, e
   * não "foi anulada" (card 20).
   */
  async numerosDosDivergentes(
    simuladoId: string,
    cursinhoId: string,
    anulacao: AnulacaoDoSimulado,
  ): Promise<number[]> {
    if (anulacao.revisao <= 0) return [];
    const r = await this.linhas
      .aggregate([
        ...this.pipeline(simuladoId, cursinhoId, anulacao.numeros),
        { $unwind: '$h.numerosAnulados' },
        { $group: { _id: '$h.numerosAnulados' } },
      ])
      .exec();
    return r.map((x: { _id: number }) => x._id).sort((a, b) => a - b);
  }

  /** O simulado com as questões populadas como o `processAnswer` as conta. */
  async simuladoParaRecalculo(simuladoId: string) {
    return this.simulados
      .findById(simuladoId)
      .populate({
        path: 'questoes.questao',
        populate: [
          { path: 'frente1', populate: { path: 'materia' } },
          { path: 'frente2', populate: { path: 'materia' } },
          { path: 'frente3', populate: { path: 'materia' } },
          { path: 'materia' },
        ],
        select: '+alternativa',
      })
      .exec();
  }

  /** Revisão e slots anulados de cada simulado — leve, sem populate. */
  async estadoDosSimulados(simuladoIds: string[]) {
    return this.simulados
      .find(
        { _id: { $in: simuladoIds.map((id) => new Types.ObjectId(id)) } },
        {
          nome: 1,
          revisaoAnulacao: 1,
          'questoes.numero': 1,
          'questoes.anulacao': 1,
        },
      )
      .lean()
      .exec();
  }
}

/** O estado leve de um simulado (`estadoDosSimulados`) → o que as consultas usam. */
export function anulacaoDoSimulado(s: {
  revisaoAnulacao?: number;
  questoes?: { numero?: number | null; anulacao?: unknown }[];
}): AnulacaoDoSimulado {
  return { revisao: s.revisaoAnulacao ?? 0, numeros: numerosDoSimulado(s) };
}
