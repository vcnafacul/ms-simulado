import { ValkeyQueueProducer } from './valkey-queue.producer';

describe('ValkeyQueueProducer', () => {
  it('should call xadd with correct stream and payload', async () => {
    const redisMock = { xadd: jest.fn().mockResolvedValue('1717000000001-0') };
    const producer = new ValkeyQueueProducer(redisMock as any);

    const id = await producer.publish('stream:test', { foo: 'bar' });

    expect(id).toBe('1717000000001-0');
    expect(redisMock.xadd).toHaveBeenCalledWith(
      'stream:test',
      'MAXLEN', '~', '10000',
      '*',
      'foo', 'bar',
    );
  });

  it('should flatten multiple payload entries correctly', async () => {
    const redisMock = { xadd: jest.fn().mockResolvedValue('1717000000002-0') };
    const producer = new ValkeyQueueProducer(redisMock as any);

    await producer.publish('stream:answers', {
      answerId: '123',
      studentId: '456',
      correct: 'true',
    });

    expect(redisMock.xadd).toHaveBeenCalledWith(
      'stream:answers',
      'MAXLEN', '~', '10000',
      '*',
      'answerId', '123',
      'studentId', '456',
      'correct', 'true',
    );
  });
});
