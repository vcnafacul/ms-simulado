import { Module } from '@nestjs/common';
import { EnvModule } from '../modules/env/env.module';
import { StorageService } from './storage.service';

@Module({
  imports: [EnvModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
