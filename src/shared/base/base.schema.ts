import { Prop, Schema } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { now } from 'mongoose';

@Schema()
export class BaseSchema {
  @ApiProperty()
  public _id?: string;

  @Prop({ required: false, default: false, select: false })
  public deleted?: boolean;

  @Prop({ default: () => now(), required: false })
  createdAt?: Date = now();

  @Prop({ default: () => now(), required: false })
  updatedAt?: Date;
}
