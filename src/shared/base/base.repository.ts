import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { GetAllInput, GetAllOutput } from './interfaces/IBaseRepository';

export class BaseRepository<T> {
  constructor(protected model: Model<T>) {}

  async create(item: T): Promise<T> {
    const domain = await this.model.create(item);
    await domain.save();
    return domain.toObject() as T;
  }

  async getAll({ page, limit }: GetAllInput): Promise<GetAllOutput<T>> {
    const query = this.model.find();
    if (limit) query.skip((page - 1) * limit).limit(limit);
    const data = await query;
    const totalItems = await this.model.countDocuments();
    return {
      data,
      page,
      limit,
      totalItems,
    };
  }

  async getById(id: string): Promise<T> {
    return await this.model.findById(id);
  }

  async getByFilter(filtro: object) {
    return await this.model.findOne(filtro);
  }

  async delete(id: string) {
    const existingRecord = await this.model.findOneAndUpdate(
      { _id: id },
      { deleted: true },
    );

    if (!existingRecord) {
      throw new NotFoundException(`Registro com ID ${id} não encontrado.`);
    }
  }
}
