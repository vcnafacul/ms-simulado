import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Subject } from '../subject/subject.schema';
import { StatusContent } from './enums/status-content.enum';

@Schema({ timestamps: false, versionKey: false })
export class Content extends BaseSchema {
  @Prop({ default: StatusContent.Pending_Upload })
  @ApiProperty({ enum: StatusContent })
  public status: StatusContent;

  @Prop()
  @ApiProperty()
  public title: string;

  @Prop({ default: '' })
  @ApiProperty()
  public description: string;

  @Prop({ ref: Subject.name, type: Types.ObjectId })
  @ApiProperty()
  public subject: Subject;

  @Prop()
  @ApiProperty()
  public userId: string;

  @Prop({ default: 0 })
  @ApiProperty()
  public order: number;
}

export const ContentSchema = SchemaFactory.createForClass(Content);
