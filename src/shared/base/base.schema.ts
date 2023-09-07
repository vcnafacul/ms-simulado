import { Prop, Schema } from '@nestjs/mongoose';

@Schema()
export class BaseSchema {
  public _id?: string;

  @Prop({ required: false, default: false, select: false })
  public deleted?: boolean;
}
