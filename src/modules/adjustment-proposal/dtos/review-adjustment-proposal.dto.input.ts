import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { ProposalStatus } from '../enums/proposal-status.enum';

export class ReviewAdjustmentProposalDTOInput {
  @ApiProperty({ enum: [ProposalStatus.Approved, ProposalStatus.Rejected] })
  @IsEnum(ProposalStatus)
  status: ProposalStatus;

  @ApiProperty()
  @IsString()
  reviewedBy: string;
}
