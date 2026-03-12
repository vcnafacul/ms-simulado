import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { AdjustmentProposal } from './adjustment-proposal.schema';
import { ProposalStatus } from './enums/proposal-status.enum';

@Injectable()
export class AdjustmentProposalRepository extends BaseRepository<AdjustmentProposal> {
  constructor(
    @InjectModel(AdjustmentProposal.name)
    model: Model<AdjustmentProposal>,
  ) {
    super(model);
  }

  async getByContent(contentId: string): Promise<AdjustmentProposal[]> {
    return this.model
      .find({ content: contentId, deleted: { $ne: true } })
      .populate('file')
      .sort({ createdAt: -1 });
  }

  async getPendingByContent(
    contentId: string,
  ): Promise<AdjustmentProposal[]> {
    return this.model
      .find({
        content: contentId,
        status: ProposalStatus.Pending,
        deleted: { $ne: true },
      })
      .populate('file');
  }
}
