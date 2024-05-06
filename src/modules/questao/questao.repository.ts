import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';

@Injectable()
export class QuestaoRepository extends BaseRepository<Questao> {
  constructor(@InjectModel(Questao.name) model: Model<Questao>) {
    super(model);
  }

  override async getAll({
    page,
    limit,
    where,
    or,
  }: GetAllWhereInput): Promise<GetAllOutput<Questao>> {
    const query = this.model
      .find()
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .and(
        or.map((o) => ({
          $or: o,
        })),
      )
      .select('+alternativa');
    query.where({ ...where });
    const data = await query;
    const totalItems = await this.model
      .where({ ...where })
      .and(
        or.map((o) => ({
          $or: o,
        })),
      )
      .countDocuments();
    return {
      data,
      page: page,
      limit: limit,
      totalItems,
    };
  }

  override async getById(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'frente2', 'frente3', 'materia', 'prova']);
  }

  async getByIdToUpdate(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'frente2', 'frente3', 'materia', 'prova']);
  }

  async getByIdToDelete(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'frente2', 'frente3', 'materia', 'prova'])
      .populate({
        path: 'prova',
        populate: 'simulados',
      });
  }

  async getQuestaoByFiltro(filtro: object, quant: number): Promise<Questao[]> {
    const questoes = await this.model
      .find(filtro)
      .exists('imageId', true)
      .select('_id')
      .sort({ quantidadeSimulado: 1 })
      .limit(quant)
      .exec();

    return questoes;
  }

  async IncrementaSimulado(questoesId: string[]) {
    await this.model.updateMany(
      { _id: { $in: questoesId } }, // Correção aqui
      {
        $inc: { quantidadeSimulado: 1 },
      },
    );
  }

  async UpdateStatus(_id: string, status: Status) {
    await this.model.updateOne({ _id }, { status });
  }

  async updateQuestion(question: UpdateDTOInput) {
    await this.model.updateOne({ _id: question._id }, { ...question });
  }

  async delete(_id: string) {
    await this.model.deleteOne({ _id });
  }
}
