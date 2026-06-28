import { BaseRepository } from 'src/shared/base/base.repository';
import { Categoria } from './schemas/categoria.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';

export class CategoriaRepository extends BaseRepository<Categoria> {
  constructor(@InjectModel(Categoria.name) model: Model<Categoria>) {
    super(model);
  }

  override async getById(id: string): Promise<Categoria> {
    return await this.model
      .findById(id)
      .populate('exame')
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

  override async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Categoria>> {
    const data = await this.model
      .find()
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .where({ ...where })
      .populate('exame');
    const totalItems = await this.model.where({ ...where }).countDocuments();
    return { data, page, limit, totalItems };
  }
}
