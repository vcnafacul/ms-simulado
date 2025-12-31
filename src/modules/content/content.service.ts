import { Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Status } from '../questao/enums/status.enum';
import { SubjectRepository } from '../subject/subject.repository';
import { ContentRepository } from './content.repository';
import { Content } from './content.schema';
import { CreateContentDTOInput } from './dtos/create.dto.input';
import { UploadFileDTOInput } from './dtos/upload-file.dto.input';
import { FileContentRepository } from './file-content/file-content.repository';
import { FileContent } from './file-content/file-content.schema';

@Injectable()
export class ContentService {
  constructor(
    private readonly repository: ContentRepository,
    private readonly fileContentRepository: FileContentRepository,
    private readonly subjectRepository: SubjectRepository,
  ) {}

  public async add(item: CreateContentDTOInput): Promise<Content> {
    // Busca o maior order existente para o subject
    const maxOrder = await this.repository.getMaxOrder(item.subject);

    const content = Object.assign(new Content(), {
      ...item,
      status: Status.Pending_Upload,
      order: maxOrder + 1,
    });
    const createdContent = await this.repository.create(content);

    // Busca o subject e adiciona o content ao array contents
    const subject = await this.subjectRepository.getById(item.subject);

    if (!subject.contents) {
      subject.contents = [];
    }
    subject.contents.push(createdContent);

    await this.subjectRepository.update(subject);

    return createdContent;
  }

  public async getById(id: string): Promise<Content> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Content>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async uploadFile(item: UploadFileDTOInput): Promise<FileContent> {
    const fileContent = Object.assign(new FileContent(), item);
    const createdFile = await this.fileContentRepository.create(fileContent);

    // Busca o content e atualiza mainFile e adiciona ao array files
    const content = await this.repository.getById(item.content);
    content.mainFile = createdFile;

    if (!content.files) {
      content.files = [];
    }
    content.files.push(createdFile);

    await this.repository.update(content);

    return createdFile;
  }

  public async getFileById(id: string): Promise<FileContent> {
    return await this.fileContentRepository.getById(id);
  }

  public async getAllFiles(
    param: GetAllInput,
  ): Promise<GetAllOutput<FileContent>> {
    return await this.fileContentRepository.getAll(param);
  }

  public async deleteFile(id: string): Promise<void> {
    await this.fileContentRepository.delete(id);
  }

  public async swapOrder(id1: string, id2: string): Promise<void> {
    const content1 = await this.repository.getById(id1);
    const content2 = await this.repository.getById(id2);

    const tempOrder = content1.order;
    content1.order = content2.order;
    content2.order = tempOrder;

    await this.repository.update(content1);
    await this.repository.update(content2);
  }

  public async moveToPosition(
    contentId: string,
    newPosition: number,
    subjectId: string,
  ): Promise<void> {
    const content = await this.repository.getById(contentId);
    const oldPosition = content.order;

    if (oldPosition === newPosition) return;

    const allContents = await this.repository.findBySubject(subjectId);

    if (newPosition < oldPosition) {
      const toUpdate = allContents.filter(
        (c) => c.order >= newPosition && c.order < oldPosition,
      );
      for (const c of toUpdate) {
        c.order += 1;
        await this.repository.update(c);
      }
    } else {
      const toUpdate = allContents.filter(
        (c) => c.order > oldPosition && c.order <= newPosition,
      );
      for (const c of toUpdate) {
        c.order -= 1;
        await this.repository.update(c);
      }
    }

    content.order = newPosition;
    await this.repository.update(content);
  }

  public async moveUp(id: string, subjectId: string): Promise<void> {
    const content = await this.repository.getById(id);
    if (content.order > 0) {
      await this.moveToPosition(id, content.order - 1, subjectId);
    }
  }

  public async moveDown(id: string, subjectId: string): Promise<void> {
    const content = await this.repository.getById(id);
    const count = await this.repository.countBySubject(subjectId);
    if (content.order < count - 1) {
      await this.moveToPosition(id, content.order + 1, subjectId);
    }
  }

  public async moveToTop(id: string, subjectId: string): Promise<void> {
    await this.moveToPosition(id, 0, subjectId);
  }

  public async moveToBottom(id: string, subjectId: string): Promise<void> {
    const count = await this.repository.countBySubject(subjectId);
    await this.moveToPosition(id, count - 1, subjectId);
  }
}
