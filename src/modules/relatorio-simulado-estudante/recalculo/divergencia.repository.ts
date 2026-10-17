import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { filtroDivergente } from '../../historico/filtro-divergente';
import { Simulado } from '../../simulado/schemas/simulado.schema';
import { RelatorioSimuladoEstudante } from '../relatorio-simulado-estudante.schema';

export interface HistoricoDivergente {
  _id: Types.ObjectId;
  usuario: string;
  createdAt?: Date;
  respostas: unknown[];
}

/**
 * As consultas da divergência (tickets/042, R3) — sobre as LINHAS do relatório
 * de um cursinho, para o recálculo pegar exatamente o que o relatório mostra.
 *
 * ⚠️ Sempre pelo `filtroDivergente` (`$not: { $gte }`): histórico anterior a
 * esta série não tem `revisaoAnulacao`, e o `$lt` o deixaria de fora.
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
    alvo: number,
  ): PipelineStage[] {
    const divergente = filtroDivergente(alvo) as { revisaoAnulacao: unknown };
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
          'h.revisaoAnulacao': divergente.revisaoAnulacao,
        },
      },
    ];
  }

  async contar(
    simuladoId: string,
    cursinhoId: string,
    alvo: number,
  ): Promise<number> {
    if (alvo <= 0) return 0;
    const [r] = await this.linhas
      .aggregate([
        ...this.pipeline(simuladoId, cursinhoId, alvo),
        { $count: 'n' },
      ])
      .exec();
    return r?.n ?? 0;
  }

  /** Um lote de divergentes, por `_id` crescente depois do cursor. */
  async lote(
    simuladoId: string,
    cursinhoId: string,
    alvo: number,
    depoisDe: Types.ObjectId | null,
    limite: number,
  ): Promise<HistoricoDivergente[]> {
    if (alvo <= 0) return [];
    return this.linhas
      .aggregate([
        ...this.pipeline(simuladoId, cursinhoId, alvo),
        ...(depoisDe ? [{ $match: { 'h._id': { $gt: depoisDe } } }] : []),
        { $sort: { 'h._id': 1 } },
        { $limit: limite },
        {
          $project: {
            _id: '$h._id',
            usuario: '$h.usuario',
            createdAt: '$h.createdAt',
            respostas: '$h.respostas',
          },
        },
      ])
      .exec();
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
