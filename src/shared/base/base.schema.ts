import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true, versionKey: false })
export class BaseSchema {
  @Prop({ required: false })
  public _id?: string;

  @Prop({ required: false, default: false })
  public deleted?: boolean;
}
