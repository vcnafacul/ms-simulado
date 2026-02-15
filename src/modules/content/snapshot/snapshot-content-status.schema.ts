import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema({ timestamps: false, versionKey: false })
export class SnapshotContentStatus extends BaseSchema {
  @Prop({ unique: true })
  @ApiProperty()
  public snapshot_date: Date;

  @Prop({ default: 0 })
  @ApiProperty()
  public pendentes: number;

  @Prop({ default: 0 })
  @ApiProperty()
  public aprovados: number;

  @Prop({ default: 0 })
  @ApiProperty()
  public reprovados: number;

  @Prop({ default: 0 })
  @ApiProperty()
  public pendentes_upload: number;

  @Prop({ default: 0 })
  @ApiProperty()
  public total: number;
}

export const SnapshotContentStatusSchema =
  SchemaFactory.createForClass(SnapshotContentStatus);
