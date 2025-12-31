import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Content } from '../content/content.schema';
import { Frente } from '../frente/frente.schema';

@Schema({ timestamps: false, versionKey: false })
export class Subject extends BaseSchema {
  @Prop()
  public name: string;

  @Prop()
  public description: string;

  @Prop({
    ref: Frente.name,
    type: Types.ObjectId,
    required: false,
  })
  public frente: Frente;

  @Prop({
    type: [{ ref: 'Content', type: mongoose.Schema.Types.ObjectId }],
    default: [],
    required: false,
  })
  contents: Content[];

  @Prop({ required: false, default: 0 })
  public order: number;
}

export const SubjectSchema = SchemaFactory.createForClass(Subject);
