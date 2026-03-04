import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Subject } from './subject.schema';

@Injectable()
export class SubjectRepository extends BaseRepository<Subject> {
  constructor(@InjectModel(Subject.name) model: Model<Subject>) {
    super(model);
  }

  async getByFrente(frenteId: string): Promise<Subject[]> {
    return this.model
      .find({ frente: frenteId, deleted: { $ne: true } })
      .sort({ order: 1 });
  }

  async getNextOrder(frenteId: string): Promise<number> {
    const last = await this.model
      .findOne({ frente: frenteId, deleted: { $ne: true } })
      .sort({ order: -1 });
    return last ? last.order + 1 : 0;
  }

  async isUnique(frenteId: string, name: string): Promise<boolean> {
    const existing = await this.model.findOne({
      frente: frenteId,
      name,
      deleted: { $ne: true },
    });
    return !existing;
  }
}
