import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentModule } from '../content/content.module';
import { ContentFileHistoryModule } from '../content-file-history/content-file-history.module';
import {
  AdjustmentProposal,
  AdjustmentProposalSchema,
} from './adjustment-proposal.schema';
import { AdjustmentProposalController } from './adjustment-proposal.controller';
import { AdjustmentProposalRepository } from './adjustment-proposal.repository';
import { AdjustmentProposalService } from './adjustment-proposal.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdjustmentProposal.name, schema: AdjustmentProposalSchema },
    ]),
    forwardRef(() => ContentModule),
    ContentFileHistoryModule,
  ],
  controllers: [AdjustmentProposalController],
  providers: [AdjustmentProposalService, AdjustmentProposalRepository],
  exports: [AdjustmentProposalService, AdjustmentProposalRepository],
})
export class AdjustmentProposalModule {}
