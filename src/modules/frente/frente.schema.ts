import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema({ timestamps: true, versionKey: false })
export class Frente extends BaseSchema {
  @Prop()
  public nome: string;
}

export const FrenteSchema = SchemaFactory.createForClass(Frente);
