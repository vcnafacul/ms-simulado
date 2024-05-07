import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Status } from '../questao/enums/status.enum';
import { Questao } from '../questao/questao.schema';
import { Prova } from './prova.schema';

@Injectable()
export class ProvaRepository extends BaseRepository<Prova> {
  constructor(@InjectModel(Prova.name) model: Model<Prova>) {
    super(model);
  }

  async update(prova: Prova) {
    await this.model.updateOne({ _id: prova._id }, prova);
  }

  async getProvaWithQuestion(id: string): Promise<Prova> {
    return await this.model.findById(id).populate(['questoes', 'exame']).exec();
  }

  async getById(id: string): Promise<Prova> {
    return await this.model
      .findById(id)
      .populate(['exame', 'simulados', 'tipo'])
      .populate({
        path: 'simulados',
        populate: ['tipo', 'questoes'],
      });
  }

  public async addQuestion(id: string, question: Questao) {
    const prova = await this.model.findById(id);
    prova.questoes.push(question);
    if (question.status === Status.Approved) {
      prova.totalQuestaoValidadas += 1;
    }
    await this.model.updateOne({ _id: prova._id }, prova);
  }

  public async removeQuestion(id: string, oldQuestao: Questao) {
    const prova = await this.model.findById(id);
    const index = prova.questoes.findIndex(
      (questao) => questao._id.toString() === oldQuestao._id.toString(),
    );
    if (index !== -1) {
      prova.questoes.splice(index, 1);
      if (oldQuestao.status === Status.Approved) {
        prova.totalQuestaoValidadas -= 1;
      }
      await this.model.updateOne({ _id: prova._id }, prova);
    }
  }
}
