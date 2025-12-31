import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteRepository extends BaseRepository<Frente> {
  constructor(@InjectModel(Frente.name) model: Model<Frente>) {
    super(model);
  }

  async findAll({ where }: GetAllWhereInput): Promise<Frente[]> {
    return await this.model
      .find()
      .populate(['materia', 'subjects'])
      .sort({ order: 1 })
      .where({ ...where });
  }

  async getMaxOrder(materiaId: string): Promise<number> {
    const result = await this.model
      .findOne({ materia: materiaId })
      .sort({ order: -1 })
      .select('order')
      .exec();
    return result?.order ?? -1;
  }

  async findByMateria(materiaId: string): Promise<Frente[]> {
    return await this.model.find({ materia: materiaId }).exec();
  }

  async countByMateria(materiaId: string): Promise<number> {
    return await this.model.countDocuments({ materia: materiaId });
  }
}
