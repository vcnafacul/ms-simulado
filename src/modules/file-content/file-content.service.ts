import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContentRepository } from '../content/content.repository';
import { StatusContent } from '../content/enums/status-content.enum';
import { ContentFileHistoryService } from '../content-file-history/content-file-history.service';
import { FileHistorySource } from '../content-file-history/content-file-history.schema';
import { CreateFileContentDTOInput } from './dtos/create-file-content.dto.input';
import { FileContentRepository } from './file-content.repository';
import { FileContent } from './file-content.schema';

@Injectable()
export class FileContentService {
  constructor(
    private readonly repository: FileContentRepository,
    private readonly contentRepository: ContentRepository,
    private readonly contentFileHistoryService: ContentFileHistoryService,
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
    content.lastEditedBy = data.uploadedBy;
    content.lastEditedAt = new Date();
    await this.contentRepository.update(content);

    await this.contentFileHistoryService.create({
      content: content as any,
      file: result as any,
      uploadedBy: data.uploadedBy,
      source: FileHistorySource.InitialUpload,
    });

    return result;
  }

  async createStandalone(
    data: CreateFileContentDTOInput,
  ): Promise<FileContent> {
    const content = await this.contentRepository.getById(data.content);
    if (!content) {
      throw new HttpException(
        `Conteúdo não encontrado com ID ${data.content}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const fileContent = Object.assign(new FileContent(), data);
    return await this.repository.create(fileContent);
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
