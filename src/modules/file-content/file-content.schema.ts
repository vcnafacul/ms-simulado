import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Content } from '../content/content.schema';

@Schema({ timestamps: false, versionKey: false })
export class FileContent extends BaseSchema {
  @Prop()
  @ApiProperty()
  public fileKey: string;

  @Prop({ required: false })
  @ApiProperty()
  public originalName?: string;

  @Prop({ ref: Content.name, type: Types.ObjectId })
  @ApiProperty()
  public content: Content;

  @Prop()
  @ApiProperty()
  public uploadedBy: string;
}

export const FileContentSchema = SchemaFactory.createForClass(FileContent);
