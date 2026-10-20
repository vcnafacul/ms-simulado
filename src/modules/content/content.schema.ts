import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Subject } from '../questao/subject/subject.schema';
import { StatusContent } from './enums/status-content.enum';

@Schema({ timestamps: false, versionKey: false })
export class Content extends BaseSchema {
  @Prop({ default: StatusContent.Pending_Upload })
  @ApiProperty({ enum: StatusContent })
  public status: StatusContent;

  @Prop()
  @ApiProperty()
  public title: string;

  @Prop({ default: '' })
  @ApiProperty()
  public description: string;

  @Prop({ ref: Subject.name, type: Types.ObjectId })
  @ApiProperty()
  public subject: Subject;

  @Prop()
  @ApiProperty()
  public userId: string;

  @Prop({ default: 0 })
  @ApiProperty()
  public order: number;

  @Prop({ ref: 'FileContent', type: Types.ObjectId, required: false })
  @ApiProperty({ required: false })
  public file: Types.ObjectId;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public lastEditedBy?: string;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public lastEditedAt?: Date;

  /**
   * Por que a demanda foi rejeitada. Só existe enquanto `status` é
   * `Rejected`: aprovar, resetar ou enviar arquivo novo apaga.
   *
   * ⚠️ Campo no documento, não consulta ao `AuditLog`: a tela lê o motivo
   * junto com a demanda; o log continua sendo a trilha de quem/quando.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public rejectionReason?: string;

  /**
   * Quem aprovou e quando. Só existe enquanto `status` é `Approved`:
   * rejeitar, resetar ou enviar arquivo novo apaga (tickets/050, D1).
   * Gravado aqui, não derivado do `AuditLog`: a listagem e o cabeçalho leem
   * direto; o log continua como trilha.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public approvedBy?: string;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public approvedAt?: Date;
}

export const ContentSchema = SchemaFactory.createForClass(Content);
