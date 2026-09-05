import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { AggregatePeriodDtoInput } from 'src/shared/dtos/aggregate-period.dto.input';
import { AggregateHistoricoDtoOutput } from './dtos/aggregate-historico.dto.output';
import { AggregatePeriodByTypeDtoOutput } from './dtos/aggregate-period-by-type.dto.output';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { HistoricoStatus } from './enums/historico-status.enum';
import { buildFullSeriesHistorico } from './handle/build-full-series-historico';
import { buildFullSeriesHistoricoByType } from './handle/build-full-seriesH-historico-by-type';
import { Historico } from './historico.schema';

@Injectable()
export class HistoricoRepository extends BaseRepository<Historico> {
  constructor(@InjectModel(Historico.name) model: Model<Historico>) {
    super(model);
  }

  async getAllByUser({
    page,
    limit,
    userId,
  }: GetHistoricoDTOInput): Promise<GetAllOutput<Historico>> {
    const data = await this.model
      .find({ usuario: userId })
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
        select: '_id nome',
      })
      .exec();

    const totalItems = await this.model
      .find({ usuario: userId })
      .countDocuments();
    return {
      data,
      page,
      limit,
      totalItems,
    };
  }

  override async getById(id: string): Promise<Historico> {
    return this.model
      .findById(id)
      .populate({
        path: 'simulado',
        populate: [{ path: 'questoes.questao' }],
      })
      .exec();
  }

  async getToPerformance(userId: string): Promise<Historico[]> {
    return this.model
      .find({ usuario: userId })
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
      })
      .exec();
  }

  async getTotalEntity() {
    return this.model.find({ deletedAt: null }).count();
  }

  async entityCompleted() {
    const result: { total: number }[] = await this.model.aggregate([
      {
        $match: {
          deletedAt: null,
          $expr: {
            $eq: [{ $size: '$respostas' }, '$questoesRespondidas'],
          },
        },
      },
      {
        $count: 'total',
      },
    ]);
    return result[0].total;
  }

  async aggregateByPeriod({ groupBy }: AggregatePeriodDtoInput) {
    const format =
      groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'month' ? '%Y-%m' : '%Y';

    const result = await this.model.aggregate([
      { $addFields: { created_at: { $toDate: '$_id' } } },
      {
        $group: {
          _id: { period: { $dateToString: { format, date: '$created_at' } } },
          total: { $sum: 1 },
          completos: {
            $sum: {
              $cond: [
                { $eq: [{ $size: '$respostas' }, '$questoesRespondidas'] },
                1,
                0,
              ],
            },
          },
          incompletos: {
            $sum: {
              $cond: [
                { $ne: [{ $size: '$respostas' }, '$questoesRespondidas'] },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          total: 1,
          completos: 1,
          incompletos: 1,
        },
      },
      { $sort: { period: 1 } },
    ]);

    return buildFullSeriesHistorico(
      groupBy,
      result as AggregateHistoricoDtoOutput[],
    );
  }

  async aggregateByPeriodAndTipo({
    groupBy,
  }: AggregatePeriodDtoInput): Promise<AggregatePeriodByTypeDtoOutput[]> {
    const format =
      groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'month' ? '%Y-%m' : '%Y';

    const result = await this.model.aggregate([
      // gera created_at com base no ObjectId
      { $addFields: { created_at: { $toDate: '$_id' } } },

      // junta com Simulado
      {
        $lookup: {
          from: 'simulados', // nome real da collection
          localField: 'simulado',
          foreignField: '_id',
          as: 'simulado',
        },
      },
      { $unwind: { path: '$simulado', preserveNullAndEmptyArrays: true } },

      // junta com Categoria
      {
        $lookup: {
          from: 'categorias', // nome real da collection
          localField: 'simulado.categoria',
          foreignField: '_id',
          as: 'tipo',
        },
      },
      { $unwind: { path: '$tipo', preserveNullAndEmptyArrays: true } },

      // agrupa por período e tipo
      {
        $group: {
          _id: {
            period: { $dateToString: { format, date: '$created_at' } },
            tipo: '$tipo.nome',
          },
          total: { $sum: 1 },
        },
      },

      // remodela para DTO
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          tipo: '$_id.tipo', // pode ser null
          total: 1,
        },
      },
      { $sort: { period: 1, tipo: 1 } },
    ]);

    return buildFullSeriesHistoricoByType(
      groupBy,
      result,
    ) as AggregatePeriodByTypeDtoOutput[];
  }

  async createPending(data: {
    usuario: string;
    simuladoId: string;
    rawRespostas: any[];
    tempoRealizado: number;
    questoesRespondidas: number;
  }): Promise<Historico> {
    return this.model.create({
      usuario: data.usuario,
      simulado: new Types.ObjectId(data.simuladoId),
      rawRespostas: data.rawRespostas,
      tempoRealizado: data.tempoRealizado,
      questoesRespondidas: data.questoesRespondidas,
      status: HistoricoStatus.Pending,
    });
  }

  async existsCartaoAtivo(
    usuario: string,
    simuladoId: string,
    cartaoCode: string,
  ): Promise<boolean> {
    const found = await this.model.exists({
      usuario,
      simulado: new Types.ObjectId(simuladoId),
      cartaoCode,
      status: { $ne: HistoricoStatus.Failed },
    });
    return found !== null;
  }

  async createAwaitingOmr(data: {
    usuario: string;
    simuladoId: string;
    imageKey: string;
    cartaoCode: string;
  }): Promise<Historico> {
    return this.model.create({
      usuario: data.usuario,
      simulado: new Types.ObjectId(data.simuladoId),
      imageKey: data.imageKey,
      cartaoCode: data.cartaoCode,
      status: HistoricoStatus.AwaitingOmr,
    });
  }

  async findByStatuses(statuses: HistoricoStatus[]): Promise<Historico[]> {
    return this.model.find({ status: { $in: statuses } }).exec();
  }

  async updateStatus(id: string, status: HistoricoStatus): Promise<void> {
    await this.model.findByIdAndUpdate(id, { status }).exec();
  }

  async findByImageKey(imageKey: string): Promise<Historico | null> {
    return this.model.findOne({ imageKey }).exec();
  }

  async prepararParaProcessamento(
    id: string,
    rawRespostas: unknown[],
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { rawRespostas, status: HistoricoStatus.Pending })
      .exec();
  }

  async claimForProcessing(id: string): Promise<boolean> {
    const result = await this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [HistoricoStatus.Pending, HistoricoStatus.Processing],
          },
        },
        { status: HistoricoStatus.Processing },
      )
      .exec();
    return result !== null;
  }

  async completeProcessing(
    id: string,
    data: {
      ano: number;
      simulado: any;
      respostas: any[];
      aproveitamento: any;
    },
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: HistoricoStatus.Completed,
        ano: data.ano,
        simulado: data.simulado,
        respostas: data.respostas,
        aproveitamento: data.aproveitamento,
        rawRespostas: null,
      })
      .exec();
  }
}
