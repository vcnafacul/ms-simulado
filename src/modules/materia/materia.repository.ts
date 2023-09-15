import { BaseRepository } from 'src/shared/base/base.repository';
import { Materia } from './materia.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MateriaRepository extends BaseRepository<Materia> {
  constructor(@InjectModel(Materia.name) model: Model<Materia>) {
    super(model);
  }
}
