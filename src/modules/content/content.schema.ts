import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Status } from '../questao/enums/status.enum';
import { Subject } from '../subject/subject.schema';
import { FileContent } from './file-content/file-content.schema';

@Schema({ timestamps: false, versionKey: false })
export class Content extends BaseSchema {
  @Prop()
  public title: string;

  @Prop()
  public description: string;

  //Filecontent principal
  @Prop({ ref: FileContent.name, type: Types.ObjectId })
  public mainFile: FileContent;

  @Prop({
    type: [{ ref: 'FileContent', type: mongoose.Schema.Types.ObjectId }],
    default: [],
    required: false,
  })
  public files: FileContent[];

  @Prop({
    ref: Subject.name,
    type: Types.ObjectId,
    required: false,
  })
  public subject: Subject;

  @Prop({ required: false, default: Status.Pending_Upload, enum: Status })
  public status: Status;

  @Prop({ required: false, default: 0 })
  public order: number;
}

export const ContentSchema = SchemaFactory.createForClass(Content);
