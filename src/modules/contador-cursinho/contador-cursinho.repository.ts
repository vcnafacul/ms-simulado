import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContadorCursinho } from './contador-cursinho.schema';

@Injectable()
export class ContadorCursinhoRepository {
  constructor(
    @InjectModel(ContadorCursinho.name)
    private readonly model: Model<ContadorCursinho>,
  ) {}

  /** `$inc` com upsert: atômico, e o primeiro cria o registro. */
  async incrementarAprovadas(cursinhoId: string): Promise<void> {
    await this.model.updateOne(
      { cursinhoId },
      { $inc: { questoesAprovadas: 1 } },
      { upsert: true },
    );
  }

  async aprovadas(cursinhoId: string): Promise<number> {
    const doc = await this.model.findOne({ cursinhoId }).lean();
    return doc?.questoesAprovadas ?? 0;
  }
}
