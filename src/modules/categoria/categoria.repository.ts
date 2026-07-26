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
      .populate('exame');
  }

  override async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Categoria>> {
    // guard por último: caller não pode sobrescrever o filtro de soft-delete
    const filter = { ...where, deleted: { $ne: true } };
    const data = await this.model
      .find()
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .where(filter)
      .populate('exame');
    const totalItems = await this.model.where(filter).countDocuments();
    return { data, page, limit, totalItems };
  }
}
