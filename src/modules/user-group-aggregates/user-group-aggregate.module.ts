import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Historico,
  HistoricoSchema,
} from '../historico/historico.schema';
import {
  UserGroupAggregate,
  UserGroupAggregateSchema,
} from './user-group-aggregate.schema';
import { UserGroupAggregateController } from './user-group-aggregate.controller';
import { UserGroupAggregateRepository } from './user-group-aggregate.repository';
import { UserGroupAggregateService } from './user-group-aggregate.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserGroupAggregate.name, schema: UserGroupAggregateSchema },
      { name: Historico.name, schema: HistoricoSchema },
    ]),
  ],
  controllers: [UserGroupAggregateController],
  providers: [UserGroupAggregateRepository, UserGroupAggregateService],
  exports: [UserGroupAggregateService],
})
export class UserGroupAggregateModule {}
