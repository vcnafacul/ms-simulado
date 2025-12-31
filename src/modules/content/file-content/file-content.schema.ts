import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Content } from '../content.schema';

@Schema({ timestamps: false, versionKey: false })
export class FileContent extends BaseSchema {
  @Prop()
  public fileKey: string;

  @Prop({ ref: 'Content', type: Types.ObjectId })
  public content: Content;

  //user, object with name, email and id
  @Prop({
    type: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      id: { type: String, required: true },
    },
  })
  public user: { name: string; email: string; id: string };
}

export const FileContentSchema = SchemaFactory.createForClass(FileContent);
