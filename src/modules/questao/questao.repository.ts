import { Injectable } from '@nestjs/common';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Questao } from './questao.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Status } from './enums/status.enum';
import { UpdateDTOInput } from './dtos/update.dto.input';

@Injectable()
export class QuestaoRepository extends BaseRepository<Questao> {
  constructor(@InjectModel(Questao.name) model: Model<Questao>) {
    super(model);
  }

  override async getAll(status: Status = Status.Pending) {
    const query = this.model.find().select('+alternativa');

    query.where({ status: status });

    return await query;
  }

  override async getById(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['exame', 'frente1', 'frente2', 'frente3', 'materia']);
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
