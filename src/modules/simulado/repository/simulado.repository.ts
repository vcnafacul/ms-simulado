import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Simulado } from '../schemas/simulado.schema';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';

@Injectable()
export class SimuladoRepository extends BaseRepository<Simulado> {
  constructor(@InjectModel(Simulado.name) model: Model<Simulado>) {
    super(model);
  }

  async getById(id: string): Promise<Simulado | null> {
    return await this.model
      .findById(id)
      .populate('tipo')
      .populate({
        path: 'questoes',
        populate: ['frente1', 'frente2', 'frente3', 'materia'],
      })
      .exec();
  }

  override async delete(id: string) {
    const existingRecord = await this.model.updateOne(
      { _id: id },
      { $set: { bloqueado: true, deleted: true } },
    );
    if (!existingRecord) {
      throw new NotFoundException(`Registro com ID ${id} não encontrado.`);
    }
  }

  async answer(id: string) {
    return await this.model
      .findById(id)
      .populate({ path: 'questoes', select: 'alternativa' })
      .exec();
  }

  override async getAll() {
    return await this.model.find().populate(['tipo']);
  }

  async update(simulado: Simulado) {
    await this.model.updateOne({ _id: simulado._id }, simulado);
  }
}
