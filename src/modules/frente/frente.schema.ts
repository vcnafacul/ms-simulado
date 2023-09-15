import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema({ timestamps: false, versionKey: false })
export class Frente extends BaseSchema {
  @Prop()
  @ApiProperty()
  public nome: string;
}

export const FrenteSchema = SchemaFactory.createForClass(Frente);
