import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

class FrenteAggregate {
  @Prop()
  @ApiProperty()
  id: string;

  @Prop()
  @ApiProperty()
  nome: string;

  @Prop()
  @ApiProperty()
  aproveitamento: number;

  @Prop()
  @ApiProperty()
  studentsContributing: number;

  @Prop()
  @ApiProperty()
  attemptsContributing: number;
}

class MateriaAggregate {
  @Prop()
  @ApiProperty()
  id: string;

  @Prop()
  @ApiProperty()
  nome: string;

  @Prop()
  @ApiProperty()
  aproveitamento: number;

  @Prop()
  @ApiProperty()
  studentsContributing: number;

  @Prop()
  @ApiProperty()
  attemptsContributing: number;

  @Prop({ type: [FrenteAggregate] })
  @ApiProperty({ type: [FrenteAggregate] })
  frentes: FrenteAggregate[];
}

class AggregatePayload {
  @Prop()
  @ApiProperty()
  geral: number;

  @Prop()
  @ApiProperty()
  totalAttempts: number;

  @Prop()
  @ApiProperty()
  totalAttemptsCompleted: number;

  @Prop()
  @ApiProperty()
  studentsWithAtLeastOneCompletedAttempt: number;

  @Prop({ type: [MateriaAggregate] })
  @ApiProperty({ type: [MateriaAggregate] })
  materias: MateriaAggregate[];
}

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'user_group_aggregates',
})
export class UserGroupAggregate {
  @Prop({ required: true, index: true })
  @ApiProperty()
  groupId: string;

  @Prop({ required: true, enum: ['class'], default: 'class' })
  @ApiProperty()
  groupType: 'class';

  @Prop({ required: true })
  @ApiProperty()
  month: string; // 'YYYY-MM'

  @Prop({ required: true })
  @ApiProperty()
  monthStart: Date;

  @Prop({ required: true })
  @ApiProperty()
  monthEnd: Date;

  @Prop({ type: [String] })
  @ApiProperty()
  userIds: string[];

  @Prop({ type: AggregatePayload })
  @ApiProperty()
  payload: AggregatePayload;

  @Prop({ default: Date.now })
  @ApiProperty()
  generatedAt: Date;

  @Prop()
  @ApiProperty()
  sourceHistoricoCount: number;
}

export const UserGroupAggregateSchema =
  SchemaFactory.createForClass(UserGroupAggregate);
UserGroupAggregateSchema.index(
  { groupId: 1, groupType: 1, month: 1 },
  { unique: true },
);
