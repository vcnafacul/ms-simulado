import { BaseRepository } from 'src/shared/base/base.repository';
import { RespostaSimulado } from '../schemas/resposta-simulado.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

export class RespostaRepository extends BaseRepository<RespostaSimulado> {
  constructor(
    @InjectModel(RespostaSimulado.name) model: Model<RespostaSimulado>,
  ) {
    super(model);
  }
}
