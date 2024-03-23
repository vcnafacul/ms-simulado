import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Historico } from './historico.schema';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

@Injectable()
export class HistoricoRepository extends BaseRepository<Historico> {
  constructor(@InjectModel(Historico.name) model: Model<Historico>) {
    super(model);
  }

  override async getAll({
    page,
    limit,
  }: GetAllInput): Promise<GetAllOutput<Historico>> {
    const data = await this.model
      .find()
      .skip(page)
      .limit(limit)
      .populate({
        path: 'simulado',
        populate: 'tipo',
      })
      .exec();
    const totalItems = await this.model.countDocuments();
    return {
      data,
      page,
      limit,
      totalItems,
    };
  }

  async getAllByUser(userId: number): Promise<Historico[]> {
    return this.model
      .find({ usuario: userId })
      .populate({
        path: 'simulado',
        populate: 'tipo',
        select: '_id nome tipo',
      })
      .select(
        '_id usuario simulado aproveitamento tempoRealizado questoesRespondidas',
      )
      .exec();
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
}
