import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { AggregatePeriodDtoInput } from 'src/shared/dtos/aggregate-period.dto.input';
import { AggregateHistoricoDtoOutput } from './dtos/aggregate-historico.dto.output';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { buildFullSeriesHistorico } from './handle/build-full-series-historico';
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
        populate: 'tipo',
        select: '_id nome tipo',
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
        populate: ['tipo', 'questoes'],
      })
      .exec();
  }

  async getToPerformance(userId: string): Promise<Historico[]> {
    return this.model
      .find({ usuario: userId })
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
        populate: ['tipo'],
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
}
