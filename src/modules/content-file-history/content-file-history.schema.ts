import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Content } from '../content/content.schema';
import { FileContent } from '../file-content/file-content.schema';

export enum FileHistorySource {
  InitialUpload = 'initial_upload',
  ProposalApproved = 'proposal_approved',
}

@Schema({ timestamps: false, versionKey: false })
export class ContentFileHistory extends BaseSchema {
  @Prop({ ref: Content.name, type: Types.ObjectId })
  @ApiProperty()
  public content: Content;

  @Prop({ ref: FileContent.name, type: Types.ObjectId })
  @ApiProperty()
  public file: FileContent;

  @Prop()
  @ApiProperty()
  public uploadedBy: string;

  @Prop({ enum: FileHistorySource })
  @ApiProperty({ enum: FileHistorySource })
  public source: FileHistorySource;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public proposalId?: string;
}

export const ContentFileHistorySchema =
  SchemaFactory.createForClass(ContentFileHistory);
