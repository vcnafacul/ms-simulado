import { Injectable } from '@nestjs/common';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Questao } from './questao.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class QuestaoRepository extends BaseRepository<Questao> {
  constructor(@InjectModel(Questao.name) model: Model<Questao>) {
    super(model);
  }

  override async getById(id: string) {
    return await this.model
      .findById(id)
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
}
