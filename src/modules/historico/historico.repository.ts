import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Historico } from './historico.schema';

@Injectable()
export class HistoricoRepository extends BaseRepository<Historico> {
  constructor(@InjectModel(Historico.name) model: Model<Historico>) {
    super(model);
  }

  override async getAll(): Promise<Historico[]> {
    return this.model
      .find()
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
        populate: 'tipo',
      })
      .exec();
  }

  async getAllByUser(userId: number): Promise<Historico[]> {
    return this.model
      .find({ usuario: userId })
      .sort({ _id: -1 })
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
