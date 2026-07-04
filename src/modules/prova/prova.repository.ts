import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
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
    return await this.model
      .findById(id)
      .populate('questoes')
      .populate({ path: 'categoria', populate: 'exame' })
      .exec();
  }

  async getById(id: string): Promise<Prova> {
    return await this.model
      .findById(id)
      .populate(['simulados', 'questoes'])
      .populate({ path: 'categoria', populate: 'exame' })
      .populate({
        path: 'simulados',
        populate: ['categoria', 'questoes'],
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

  async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Prova>> {
    const data = await this.model
      .find()
      .populate({ path: 'categoria', populate: { path: 'exame' } })
      .populate('questoes')
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .where({ ...where });
    const totalItems = await this.model.where({ ...where }).countDocuments();
    return { data, page, limit, totalItems };
  }

  async getAllPopulated(): Promise<Prova[]> {
    return await this.model
      .find()
      .populate({ path: 'categoria', populate: 'exame' })
      .populate({
        path: 'simulados',
        populate: ['categoria', 'questoes'],
      })
      .populate('questoes')
      .exec();
  }

  async getTotalEntity() {
    return this.model.find({ deletedAt: null }).count();
  }
}
