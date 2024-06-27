import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Frente } from '../frente/frente.schema';
import mongoose from 'mongoose';

@Schema({ timestamps: false, versionKey: false })
export class Materia extends BaseSchema {
  @Prop()
  @ApiProperty()
  public nome: string;

  @Prop()
  @ApiProperty()
  public enemArea: string;

  @Prop({
    type: [{ ref: 'Frente', type: mongoose.Schema.Types.ObjectId }],
    default: [],
    required: false,
  })
  @ApiProperty()
  public frentes: Frente[];
}

export const MateriaSchema = SchemaFactory.createForClass(Materia);
