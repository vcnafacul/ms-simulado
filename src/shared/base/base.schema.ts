import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ timestamps: true, versionKey: false })
export class BaseSchema {
  public _id: string;

  @Prop()
  public deleted: boolean;
}
