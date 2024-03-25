import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';

@Injectable()
export class QuestaoRepository extends BaseRepository<Questao> {
  constructor(@InjectModel(Questao.name) model: Model<Questao>) {
    super(model);
  }

  override async getAll(
    param: GetAllInput,
    status: Status = Status.Pending,
  ): Promise<GetAllOutput<Questao>> {
    const query = this.model.find().select('+alternativa');
    const totalItems = await this.model.countDocuments();
    query.where({ status: status });
    const data = await query;
    return {
      data,
      page: param.page,
      limit: param.limit,
      totalItems,
    };
  }

  override async getById(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'frente2', 'frente3', 'materia', 'prova']);
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
}
