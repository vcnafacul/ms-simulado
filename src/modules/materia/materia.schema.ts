import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema({ timestamps: false, versionKey: false })
export class Materia extends BaseSchema {
  @Prop()
  @ApiProperty()
  public nome: string;

  @Prop()
  @ApiProperty()
  public enemArea: string;
}

export const MateriaSchema = SchemaFactory.createForClass(Materia);
