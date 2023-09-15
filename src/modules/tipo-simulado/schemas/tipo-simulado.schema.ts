import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Regra } from './regra.schemas';
import { ApiProperty } from '@nestjs/swagger';

@Schema({ timestamps: true, versionKey: false })
export class TipoSimulado extends BaseSchema {
  @Prop({ unique: true })
  @ApiProperty()
  public nome: string;

  @Prop()
  @ApiProperty()
  public duracao: number;

  @Prop()
  @ApiProperty()
  public quantidadeTotalQuestao: number;

  @Prop([Regra])
  @ApiProperty({ isArray: true, type: Regra })
  public regras: Regra[];
}

export const TipoSimuladoSchema = SchemaFactory.createForClass(TipoSimulado);
