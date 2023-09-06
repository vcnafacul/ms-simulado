import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema()
export class Exame extends BaseSchema {
  @Prop()
  public nome: string;
  @Prop()
  public localizacao: string;
}

export const ExameSchema = SchemaFactory.createForClass(Exame)
