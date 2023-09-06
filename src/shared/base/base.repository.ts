import { NotFoundException } from "@nestjs/common";
import { Model } from "mongoose";

export class BaseRepository<T> {
  constructor(
    protected model: Model<T> 
  ) {}

  async create(item: T): Promise<T>{
    const domain = await this.model.create(item);
    await domain.save();
    return domain.toObject() as T;
  }

  async getAll() {
    return await this.model.find();
  }

  async getById(id: string) {
    return await this.model.findById(id);
  }

  async delete(id: string) {
    const existingRecord = await this.model.findOneAndUpdate(
      { _id: id },
      { deleted: true },
    );

    if (!existingRecord) {
      throw new NotFoundException(`Registro com ID ${id} não encontrado.`);
    }

    return existingRecord;
  }
}