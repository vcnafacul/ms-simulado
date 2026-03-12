import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { ContentFileHistory } from './content-file-history.schema';

@Injectable()
export class ContentFileHistoryRepository extends BaseRepository<ContentFileHistory> {
  constructor(
    @InjectModel(ContentFileHistory.name)
    model: Model<ContentFileHistory>,
  ) {
    super(model);
  }

  async getByContent(contentId: string): Promise<ContentFileHistory[]> {
    return this.model
      .find({ content: contentId, deleted: { $ne: true } })
      .populate('file')
      .sort({ createdAt: 1 });
  }
}
