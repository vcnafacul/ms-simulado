import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Simulado } from './simulado.schema';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';

@Injectable()
export class SimuladoRepository extends BaseRepository<Simulado> {
  constructor(@InjectModel(Simulado.name) model: Model<Simulado>) {
    super(model);
  }

  async findOne(filtro: object) {
    return await this.model.findOne(filtro);
  }
}
