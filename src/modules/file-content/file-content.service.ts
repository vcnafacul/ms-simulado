import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContentRepository } from '../content/content.repository';
import { StatusContent } from '../content/enums/status-content.enum';
import { CreateFileContentDTOInput } from './dtos/create-file-content.dto.input';
import { FileContentRepository } from './file-content.repository';
import { FileContent } from './file-content.schema';

@Injectable()
export class FileContentService {
  constructor(
    private readonly repository: FileContentRepository,
    private readonly contentRepository: ContentRepository,
  ) {}

  async create(data: CreateFileContentDTOInput): Promise<FileContent> {
    const content = await this.contentRepository.getById(data.content);
    if (!content) {
      throw new HttpException(
        `Conteúdo não encontrado com ID ${data.content}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const fileContent = Object.assign(new FileContent(), data);
    const result = await this.repository.create(fileContent);

    content.status = StatusContent.Pending;
    content.file = new Types.ObjectId(result._id);
    await this.contentRepository.update(content);

    return result;
  }

  async getById(id: string): Promise<FileContent> {
    return await this.repository.getById(id);
  }

  async getByContent(contentId: string): Promise<FileContent[]> {
    return await this.repository.getByContent(contentId);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
