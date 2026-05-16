import { InMemoryQueueProducer } from './in-memory-queue.producer';
import { InMemoryQueueConsumer } from './in-memory-queue.consumer';
import { memoryBus } from './memory-bus';

describe('InMemory Queue', () => {
  let producer: InMemoryQueueProducer;
  let consumer: InMemoryQueueConsumer;

  beforeEach(() => {
    memoryBus.removeAllListeners();
    producer = new InMemoryQueueProducer();
    consumer = new InMemoryQueueConsumer();
  });

  it('should deliver message to registered handler', async () => {
    const received: Record<string, string>[] = [];

    consumer.register('stream:test', 'g', 'c', async (_id, fields) => {
      received.push(fields);
    });

    await producer.publish('stream:test', { foo: 'bar' });

    await new Promise((r) => setImmediate(r));
    expect(received).toHaveLength(1);
    expect(received[0].foo).toBe('bar');
  });

  it('should not deliver to wrong stream', async () => {
    const received: Record<string, string>[] = [];
    consumer.register('stream:other', 'g', 'c', async (_id, fields) => {
      received.push(fields);
    });
    await producer.publish('stream:test', { foo: 'bar' });
    await new Promise((r) => setImmediate(r));
    expect(received).toHaveLength(0);
  });
});
