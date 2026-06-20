import { BaseRepository } from 'src/shared/base/base.repository';
import { Categoria } from './schemas/categoria.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export class CategoriaRepository extends BaseRepository<Categoria> {
  constructor(@InjectModel(Categoria.name) model: Model<Categoria>) {
    super(model);
  }

  override async getById(id: string): Promise<Categoria> {
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
