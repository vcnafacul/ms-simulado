import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { SnapshotContentStatus } from './snapshot-content-status.schema';

@Injectable()
export class SnapshotContentStatusRepository extends BaseRepository<SnapshotContentStatus> {
  constructor(
    @InjectModel(SnapshotContentStatus.name)
    model: Model<SnapshotContentStatus>,
  ) {
    super(model);
  }

  async getAllSnapshots(): Promise<SnapshotContentStatus[]> {
    return this.model.find().sort({ snapshot_date: 1 });
  }
}
