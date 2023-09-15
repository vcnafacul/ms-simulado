import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Localizacao } from './enum/localizacao.enum';

@Schema({ timestamps: false, versionKey: false })
export class Exame extends BaseSchema {
  @Prop()
  @ApiProperty()
  public nome: string;
  @Prop()
  @ApiProperty({ enum: Localizacao })
  public localizacao: Localizacao;
}

export const ExameSchema = SchemaFactory.createForClass(Exame);
