import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContentRepository } from '../content/content.repository';
import { ContentFileHistoryService } from '../content-file-history/content-file-history.service';
import { FileHistorySource } from '../content-file-history/content-file-history.schema';
import { AdjustmentProposalRepository } from './adjustment-proposal.repository';
import { AdjustmentProposal } from './adjustment-proposal.schema';
import { CreateAdjustmentProposalDTOInput } from './dtos/create-adjustment-proposal.dto.input';
import { ReviewAdjustmentProposalDTOInput } from './dtos/review-adjustment-proposal.dto.input';
import { ProposalStatus } from './enums/proposal-status.enum';

@Injectable()
export class AdjustmentProposalService {
  constructor(
    private readonly repository: AdjustmentProposalRepository,
    private readonly contentRepository: ContentRepository,
    private readonly contentFileHistoryService: ContentFileHistoryService,
  ) {}

  async create(
    data: CreateAdjustmentProposalDTOInput,
  ): Promise<AdjustmentProposal> {
    const content = await this.contentRepository.getById(data.content);
    if (!content) {
      throw new HttpException(
        `Conteudo nao encontrado com ID ${data.content}`,
        HttpStatus.NOT_FOUND,
      );
    }
    if (!content.file) {
      throw new HttpException(
        'Conteudo nao possui arquivo vigente',
        HttpStatus.BAD_REQUEST,
      );
    }

    const entity = Object.assign(new AdjustmentProposal(), data);
    return await this.repository.create(entity);
  }

  async getByContent(contentId: string): Promise<AdjustmentProposal[]> {
    return await this.repository.getByContent(contentId);
  }

  async getById(id: string): Promise<AdjustmentProposal> {
    return await this.repository.getById(id);
  }

  async review(
    id: string,
    dto: ReviewAdjustmentProposalDTOInput,
  ): Promise<AdjustmentProposal> {
    const proposal = await this.repository.getById(id);
    if (!proposal) {
      throw new HttpException(
        'Proposta nao encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    if (proposal.status !== ProposalStatus.Pending) {
      throw new HttpException(
        'Proposta ja foi revisada',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.reviewedBy === proposal.author) {
      throw new HttpException(
        'Autor nao pode revisar a propria proposta',
        HttpStatus.FORBIDDEN,
      );
    }

    if (dto.status === ProposalStatus.Approved) {
      const session = await this.repository.startSession();
      session.startTransaction();
      try {
        const content = await this.contentRepository.getById(
          proposal.content as any,
        );

        content.file = new Types.ObjectId(proposal.file as any);
        content.lastEditedBy = dto.reviewedBy;
        content.lastEditedAt = new Date();
        await this.contentRepository.update(content);

        await this.contentFileHistoryService.create({
          content: content as any,
          file: proposal.file,
          uploadedBy: proposal.author,
          source: FileHistorySource.ProposalApproved,
          proposalId: proposal._id,
        });

        proposal.status = ProposalStatus.Approved;
        proposal.reviewedBy = dto.reviewedBy;
        await this.repository.update(proposal);

        await session.commitTransaction();
        session.endSession();
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    } else {
      proposal.status = ProposalStatus.Rejected;
      proposal.reviewedBy = dto.reviewedBy;
      await this.repository.update(proposal);
    }

    return await this.repository.getById(id);
  }
}
