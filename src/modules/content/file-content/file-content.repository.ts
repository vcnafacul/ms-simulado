import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { FileContent } from './file-content.schema';

@Injectable()
export class FileContentRepository extends BaseRepository<FileContent> {
  constructor(@InjectModel(FileContent.name) model: Model<FileContent>) {
    super(model);
  }
}
