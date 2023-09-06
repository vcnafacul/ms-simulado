import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema()
export class Frente extends BaseSchema {
  @Prop()
  public nome: string;
}

export const FrenteSchema = SchemaFactory.createForClass(Frente);
