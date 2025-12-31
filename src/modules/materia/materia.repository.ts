import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { Materia } from './materia.schema';

@Injectable()
export class MateriaRepository extends BaseRepository<Materia> {
  constructor(@InjectModel(Materia.name) model: Model<Materia>) {
    super(model);
  }

  async findAll({ where }: GetAllWhereInput): Promise<Materia[]> {
    return await this.model
      .find()
      .populate(['frentes'])
      .where({ ...where });
  }
}
