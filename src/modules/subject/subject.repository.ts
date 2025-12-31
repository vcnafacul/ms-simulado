import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Subject } from './subject.schema';

@Injectable()
export class SubjectRepository extends BaseRepository<Subject> {
  constructor(@InjectModel(Subject.name) model: Model<Subject>) {
    super(model);
  }

  override async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Subject>> {
    const data = await this.model
      .find()
      .populate(['frente', 'contents'])
      .sort({ order: 1 })
      .limit(limit ?? Infinity)
      .where({ ...where });
    const totalItems = await this.model.where({ ...where }).countDocuments();
    return {
      data,
      page,
      limit,
      totalItems,
    };
  }

  async getMaxOrder(frenteId: string): Promise<number> {
    const result = await this.model
      .findOne({ frente: frenteId })
      .sort({ order: -1 })
      .select('order')
      .exec();
    return result?.order ?? -1;
  }

  async findByFrente(frenteId: string): Promise<Subject[]> {
    return await this.model.find({ frente: frenteId }).exec();
  }

  async countByFrente(frenteId: string): Promise<number> {
    return await this.model.countDocuments({ frente: frenteId });
  }
}
