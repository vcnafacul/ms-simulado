import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
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

  async getToPerformance(userId: number): Promise<Historico[]> {
    return this.model
      .find({ usuario: userId })
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
        populate: ['tipo'],
      })
      .exec();
  }
}
