import { Injectable } from '@nestjs/common';
import { ContentFileHistoryRepository } from './content-file-history.repository';
import { ContentFileHistory } from './content-file-history.schema';

@Injectable()
export class ContentFileHistoryService {
  constructor(private readonly repository: ContentFileHistoryRepository) {}

  async create(
    data: Partial<ContentFileHistory>,
  ): Promise<ContentFileHistory> {
    const entity = Object.assign(new ContentFileHistory(), data);
    return await this.repository.create(entity);
  }

  async getByContent(contentId: string): Promise<ContentFileHistory[]> {
    return await this.repository.getByContent(contentId);
  }
}
