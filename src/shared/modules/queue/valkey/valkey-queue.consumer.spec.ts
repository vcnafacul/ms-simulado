import { ValkeyQueueConsumer } from './valkey-queue.consumer';

describe('ValkeyQueueConsumer', () => {
  it('does not busy-loop the event loop when started with no registrations', async () => {
    const redisMock = { xgroup: jest.fn(), xreadgroup: jest.fn(), xautoclaim: jest.fn() };
    const consumer = new ValkeyQueueConsumer(redisMock as any);

    await consumer.onApplicationBootstrap();

    // If poll() were busy-spinning synchronously, this setImmediate callback
    // would never get a chance to run.
    const yielded = await new Promise((resolve) => setImmediate(() => resolve(true)));
    expect(yielded).toBe(true);

    consumer.onModuleDestroy();
  });

  it('creates the consumer group only for streams registered before bootstrap', async () => {
    const redisMock = {
      xgroup: jest.fn().mockResolvedValue('OK'),
      xreadgroup: jest.fn().mockResolvedValue(null),
      xautoclaim: jest.fn().mockResolvedValue(null),
    };
    const consumer = new ValkeyQueueConsumer(redisMock as any);

    consumer.register('stream:simulado:answers', 'answer-processors', 'processor-1', async () => {});
    await consumer.onApplicationBootstrap();

    expect(redisMock.xgroup).toHaveBeenCalledWith(
      'CREATE',
      'stream:simulado:answers',
      'answer-processors',
      '$',
      'MKSTREAM',
    );

    consumer.onModuleDestroy();
  });
});
