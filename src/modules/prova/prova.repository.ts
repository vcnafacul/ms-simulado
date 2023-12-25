import { Injectable } from '@nestjs/common';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Prova } from './prova.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ProvaRepository extends BaseRepository<Prova> {
  constructor(@InjectModel(Prova.name) model: Model<Prova>) {
    super(model);
  }

  async update(prova: Prova) {
    await this.model.updateOne({ _id: prova._id }, prova);
  }

  async getProvaWithQuestion(id: string): Promise<Prova> {
    return (await this.model.findById(id)).populate(['questoes']);
  }

  async getById(id: string): Promise<Prova> {
    return await this.model.findById(id).populate(['simulado']);
  }
}
