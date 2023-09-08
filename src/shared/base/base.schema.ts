import { Prop, Schema } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

@Schema()
export class BaseSchema {
  @ApiProperty()
  public _id?: string;

  @Prop({ required: false, default: false, select: false })
  public deleted?: boolean;
}
