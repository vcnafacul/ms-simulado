import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { HistoricoStatus } from './enums/historico-status.enum';
import { AproveitamentoHistorico } from './types/aproveitamento';
import { Resposta } from './types/resposta';

@Schema({ timestamps: false, versionKey: false })
export class Historico extends BaseSchema {
  @Prop()
  @ApiProperty()
  public usuario: string;

  @Prop()
  @ApiProperty()
  public ano: number;

  @Prop({ ref: Simulado.name, type: Types.ObjectId })
  @ApiProperty()
  public simulado: Simulado;

  @Prop({ type: [Object] })
  @ApiProperty()
  public respostas: Resposta[];

  @Prop({ type: AproveitamentoHistorico })
  @ApiProperty()
  public aproveitamento: AproveitamentoHistorico;

  @Prop()
  @ApiProperty()
  public tempoRealizado: number;

  @Prop()
  @ApiProperty()
  public questoesRespondidas: number;

  @Prop({
    type: String,
    enum: HistoricoStatus,
    default: HistoricoStatus.Pending,
    index: true,
  })
  @ApiProperty({ enum: HistoricoStatus })
  public status: HistoricoStatus;

  @Prop({ type: [Object], default: null })
  public rawRespostas: any[] | null;
}

export const HistoricoSchema = SchemaFactory.createForClass(Historico);
