import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Frente } from '../../frente/frente.schema';

@Schema({ timestamps: false, versionKey: false })
export class Subject extends BaseSchema {
  @Prop()
  @ApiProperty()
  public name: string;

  @Prop({ default: '' })
  @ApiProperty()
  public description: string;

  @Prop({ ref: Frente.name, type: Types.ObjectId })
  @ApiProperty()
  public frente: Frente;

  @Prop({ default: 0 })
  @ApiProperty()
  public order: number;
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);
