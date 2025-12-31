import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { Content } from './content.schema';

@Injectable()
export class ContentRepository extends BaseRepository<Content> {
  constructor(@InjectModel(Content.name) model: Model<Content>) {
    super(model);
  }

  async findAll({ where }: GetAllWhereInput): Promise<Content[]> {
    return await this.model
      .find()
      .populate(['subject', 'mainFile'])
      .sort({ order: 1 })
      .where({ ...where });
  }

  async getMaxOrder(subjectId: string): Promise<number> {
    const result = await this.model
      .findOne({ subject: subjectId })
      .sort({ order: -1 })
      .select('order')
      .exec();
    return result?.order ?? -1;
  }

  async findBySubject(subjectId: string): Promise<Content[]> {
    return await this.model.find({ subject: subjectId }).exec();
  }

  async countBySubject(subjectId: string): Promise<number> {
    return await this.model.countDocuments({ subject: subjectId });
  }
}
