import { BaseRepository } from 'src/shared/base/base.repository';
import { TipoSimulado } from './schemas/tipo-simulado.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export class TipoSimuladoRepository extends BaseRepository<TipoSimulado> {
  constructor(@InjectModel(TipoSimulado.name) model: Model<TipoSimulado>) {
    super(model);
  }

  override async getById(id: string): Promise<TipoSimulado> {
    return await this.model
      .findById(id)
      .populate({
        path: 'regras',
        populate: {
          path: 'materia',
          model: 'Materia',
        },
      })
      .populate({
        path: 'regras',
        populate: {
          path: 'frente',
          model: 'Frente',
        },
      });
  }
}
