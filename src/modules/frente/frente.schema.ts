import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import mongoose, { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Materia } from '../materia/materia.schema';
import { Subject } from '../subject/subject.schema';

@Schema({ timestamps: false, versionKey: false })
export class Frente extends BaseSchema {
  @Prop()
  @ApiProperty()
  public nome: string;

  @Prop({ ref: Materia.name, type: Types.ObjectId })
  @ApiProperty()
  public materia: Materia;

  @Prop({
    type: [{ ref: 'Subject', type: mongoose.Schema.Types.ObjectId }],
    default: [],
    required: false,
  })
  @ApiProperty()
  public subjects: Subject[];

  @Prop({ required: false, default: 0 })
  @ApiProperty()
  public order: number;
}

export const FrenteSchema = SchemaFactory.createForClass(Frente);
