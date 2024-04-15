import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Materia } from '../materia/materia.schema';
import { Types } from 'mongoose';

@Schema({ timestamps: false, versionKey: false })
export class Frente extends BaseSchema {
  @Prop()
  @ApiProperty()
  public nome: string;

  @Prop({ ref: Materia.name, type: Types.ObjectId })
  @ApiProperty()
  public materia: Materia;
}

export const FrenteSchema = SchemaFactory.createForClass(Frente);
