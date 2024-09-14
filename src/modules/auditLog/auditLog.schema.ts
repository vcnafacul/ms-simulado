import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';

@Schema({ timestamps: false, versionKey: false })
export class AuditLog extends BaseSchema {
  @Prop()
  public user: string;

  @Prop()
  public entityId: string;

  @Prop()
  public changes: string;

  @Prop()
  public entityType: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
