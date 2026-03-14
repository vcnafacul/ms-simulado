import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdjustmentProposalService } from './adjustment-proposal.service';
import { AdjustmentProposal } from './adjustment-proposal.schema';
import { CreateAdjustmentProposalDTOInput } from './dtos/create-adjustment-proposal.dto.input';
import { ReviewAdjustmentProposalDTOInput } from './dtos/review-adjustment-proposal.dto.input';

@ApiTags('AdjustmentProposal')
@Controller('v1/adjustment-proposal')
export class AdjustmentProposalController {
  constructor(private readonly service: AdjustmentProposalService) {}

  @Post()
  @ApiResponse({
    status: 201,
    description: 'proposta de ajuste criada',
    type: AdjustmentProposal,
  })
  async create(
    @Body() model: CreateAdjustmentProposalDTOInput,
  ): Promise<AdjustmentProposal> {
    return await this.service.create(model);
  }

  @Get('content/:contentId')
  @ApiResponse({
    status: 200,
    description: 'propostas por conteudo',
    type: AdjustmentProposal,
    isArray: true,
  })
  async getByContent(
    @Param('contentId') contentId: string,
  ): Promise<AdjustmentProposal[]> {
    return await this.service.getByContent(contentId);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'proposta por ID',
    type: AdjustmentProposal,
  })
  async getById(@Param('id') id: string): Promise<AdjustmentProposal> {
    return await this.service.getById(id);
  }

  @Patch(':id/review')
  @ApiResponse({
    status: 200,
    description: 'proposta revisada',
    type: AdjustmentProposal,
  })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewAdjustmentProposalDTOInput,
  ): Promise<AdjustmentProposal> {
    return await this.service.review(id, dto);
  }
}
