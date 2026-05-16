import { Global, Module } from '@nestjs/common';
import { QueueDriver } from '../../enum/queue-driver.enum';
import { QueueConsumer } from './queue.consumer';
import { QueueProducer } from './queue.producer';
import { InMemoryQueueConsumer } from './in-memory/in-memory-queue.consumer';
import { InMemoryQueueProducer } from './in-memory/in-memory-queue.producer';
import { ValkeyQueueConsumer } from './valkey/valkey-queue.consumer';
import { ValkeyQueueProducer } from './valkey/valkey-queue.producer';

@Global()
@Module({
  providers: [
    {
      provide: 'QUEUE_REDIS_CLIENT',
      useFactory: async () => {
        const driver = process.env.QUEUE_DRIVER;
        if (driver !== QueueDriver.Redis) return null;
        const Redis = (await import('ioredis')).default;
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
          lazyConnect: true,
        });
      },
    },
    {
      provide: QueueProducer,
      inject: ['QUEUE_REDIS_CLIENT'],
      useFactory: (redis: any) => {
        if (process.env.QUEUE_DRIVER === QueueDriver.Redis) {
          return new ValkeyQueueProducer(redis);
        }
        return new InMemoryQueueProducer();
      },
    },
    {
      provide: QueueConsumer,
      inject: ['QUEUE_REDIS_CLIENT'],
      useFactory: (redis: any) => {
        if (process.env.QUEUE_DRIVER === QueueDriver.Redis) {
          return new ValkeyQueueConsumer(redis);
        }
        return new InMemoryQueueConsumer();
      },
    },
  ],
  exports: [QueueProducer, QueueConsumer],
})
export class QueueModule {}
