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
      .select('+alternativa');

    const queryCount = this.model.where({ ...where });

    if (or.length > 0) {
      query.and(
        or.map((o) => ({
          $or: o,
        })),
      );
      queryCount.and(
        or.map((o) => ({
          $or: o,
        })),
      );
    }
    query.where({ ...where });
    const data = await query;
    const totalItems = await queryCount.countDocuments();
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
      .populate(['frente1', 'materia', 'prova']);
  }

  async getByIdToUpdate(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'materia', 'prova']);
  }

  async getByIdToDelete(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'materia', 'prova'])
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
    if (question.frente2 === '') question.frente2 = null;
    if (question.frente3 === '') question.frente3 = null;
    await this.model.updateOne({ _id: question._id }, { ...question });
  }

  async delete(_id: string) {
    await this.model.deleteOne({ _id });
  }

  async canInsertQuestion(
    provaId: string,
    numero: number,
    frente1: string,
  ): Promise<boolean> {
    const questaoExistente = await this.model.findOne({
      prova: provaId,
      numero,
      frente1,
    });

    return !questaoExistente; // se já existe, não pode cadastrar → false
  }
}
