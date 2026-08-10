import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { Status } from '../questao/enums/status.enum';
import { Questao } from '../questao/questao.schema';
import {
  addQuestaoToContainer,
  removeQuestaoFromContainer,
} from './helpers/question-container.helpers';
import { Prova } from './prova.schema';

@Injectable()
export class ProvaRepository extends BaseRepository<Prova> {
  constructor(@InjectModel(Prova.name) model: Model<Prova>) {
    super(model);
  }

  async update(prova: Prova, session?: ClientSession) {
    await this.model.updateOne({ _id: prova._id }, prova, { session });
  }

  async getProvaWithQuestion(id: string): Promise<Prova> {
    return await this.model
      .findById(id)
      .populate({ path: 'categoria', populate: 'exame' })
      .exec();
  }

  async getById(id: string): Promise<Prova> {
    return await this.model
      .findById(id)
      .populate('simulados')
      .populate('questoes.questao')
      .populate({ path: 'categoria', populate: 'exame' })
      .populate({
        path: 'simulados',
        populate: ['categoria', { path: 'questoes.questao' }],
      });
  }

  public async addQuestion(id: string, question: Questao, numero: number) {
    const prova = await this.model.findById(id);
    addQuestaoToContainer(prova, question, numero);
    if (question.status === Status.Approved) {
      prova.totalQuestaoValidadas += 1;
    }
    await this.model.updateOne({ _id: prova._id }, prova);
  }

  public async removeQuestion(id: string, oldQuestao: Questao) {
    const prova = await this.model.findById(id);
    const before = prova.questoes.length;
    removeQuestaoFromContainer(prova, oldQuestao._id);
    // Questão não estava na prova: nada mudou → evita write espúrio.
    if (prova.questoes.length === before) return;
    if (oldQuestao.status === Status.Approved) {
      prova.totalQuestaoValidadas -= 1;
    }
    await this.model.updateOne({ _id: prova._id }, prova);
  }

  async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Prova>> {
    const data = await this.model
      .find()
      .populate({ path: 'categoria', populate: { path: 'exame' } })
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .where({ ...where });
    const totalItems = await this.model.where({ ...where }).countDocuments();
    return { data, page, limit, totalItems };
  }

  async getTotalEntity() {
    return this.model.find({ deletedAt: null }).count();
  }
}
