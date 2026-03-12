import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Content } from '../content/content.schema';
import { FileContent } from '../file-content/file-content.schema';
import { ProposalStatus } from './enums/proposal-status.enum';

@Schema({ timestamps: false, versionKey: false })
export class AdjustmentProposal extends BaseSchema {
  @Prop({ ref: Content.name, type: Types.ObjectId })
  @ApiProperty()
  public content: Content;

  @Prop({ ref: FileContent.name, type: Types.ObjectId })
  @ApiProperty()
  public file: FileContent;

  @Prop({ default: ProposalStatus.Pending })
  @ApiProperty({ enum: ProposalStatus })
  public status: ProposalStatus;

  @Prop()
  @ApiProperty()
  public author: string;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public comment?: string;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public reviewedBy?: string;
}

export const AdjustmentProposalSchema =
  SchemaFactory.createForClass(AdjustmentProposal);
