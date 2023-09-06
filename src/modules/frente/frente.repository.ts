import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteRepository extends BaseRepository<Frente> {
  constructor(@InjectModel(Frente.name) model: Model<Frente>) {
    super(model);
  }
}
