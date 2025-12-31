import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Colaborador } from './colaborador.schema';

@Injectable()
export class ColaboradorRepository extends BaseRepository<Colaborador> {
  constructor(@InjectModel(Colaborador.name) model: Model<Colaborador>) {
    super(model);
  }

  async findByColaboradorId(
    colaboradorId: string,
  ): Promise<Colaborador | null> {
    return await this.model.findOne({ colaboradorId }).exec();
  }

  async upsert(
    colaboradorId: string,
    data: Partial<Colaborador>,
  ): Promise<Colaborador> {
    const result = await this.model
      .findOneAndUpdate(
        { colaboradorId },
        { $set: data },
        { upsert: true, new: true },
      )
      .exec();

    return result;
  }

  async findByFrenteId(frenteId: string): Promise<Colaborador[]> {
    return await this.model.find({ 'afinidades.frenteId': frenteId }).exec();
  }

  async findByMateriaId(materiaId: string): Promise<Colaborador[]> {
    return await this.model.find({ 'afinidades.materiaId': materiaId }).exec();
  }
}
