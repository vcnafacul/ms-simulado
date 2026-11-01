import { ValkeyQueueConsumer } from './valkey-queue.consumer';

// Espera uma condição com timers reais: o laço de leitura tem pausas próprias.
async function esperar(cond: () => boolean, ms = 3000) {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('condição não aconteceu a tempo');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const erroNoGroup = () =>
  new Error(
    "NOGROUP No such key 'stream:simulado:answers' or consumer group 'answer-processors' in XREADGROUP with GROUP option",
  );

describe('ValkeyQueueConsumer', () => {
  it('does not busy-loop the event loop when started with no registrations', async () => {
    const redisMock = {
      xgroup: jest.fn(),
      xreadgroup: jest.fn(),
      xautoclaim: jest.fn(),
    };
    const consumer = new ValkeyQueueConsumer(redisMock as any);

    await consumer.onApplicationBootstrap();

    // If poll() were busy-spinning synchronously, this setImmediate callback
    // would never get a chance to run.
    const yielded = await new Promise((resolve) =>
      setImmediate(() => resolve(true)),
    );
    expect(yielded).toBe(true);

    consumer.onModuleDestroy();
  });

  it('creates the consumer group reading from the start of the stream', async () => {
    const redisMock = {
      xgroup: jest.fn().mockResolvedValue('OK'),
      xreadgroup: jest.fn().mockResolvedValue(null),
      xautoclaim: jest.fn().mockResolvedValue(null),
    };
    const consumer = new ValkeyQueueConsumer(redisMock as any);

    consumer.register(
      'stream:simulado:answers',
      'answer-processors',
      'processor-1',
      async () => {},
    );
    await consumer.onApplicationBootstrap();

    expect(redisMock.xgroup).toHaveBeenCalledWith(
      'CREATE',
      'stream:simulado:answers',
      'answer-processors',
      '0',
      'MKSTREAM',
    );

    consumer.onModuleDestroy();
  });

  // tickets/056 · 05b: o Redis de homol foi recriado vazio, o grupo sumiu e o
  // laço de leitura morreu no primeiro NOGROUP — o cartão ficou parado na fila.
  it('recreates the group and keeps reading when the group disappears (NOGROUP)', async () => {
    const mensagem = [['stream:simulado:answers', [['1-0', ['histId', 'h1']]]]];
    const redisMock = {
      xgroup: jest.fn().mockResolvedValue('OK'),
      xreadgroup: jest
        .fn()
        .mockRejectedValueOnce(erroNoGroup())
        .mockResolvedValueOnce(mensagem)
        .mockResolvedValue(null),
      xautoclaim: jest.fn().mockResolvedValue(null),
      xack: jest.fn().mockResolvedValue(1),
      xdel: jest.fn().mockResolvedValue(1),
    };
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new ValkeyQueueConsumer(redisMock as any);
    consumer.register(
      'stream:simulado:answers',
      'answer-processors',
      'processor-1',
      handler,
    );

    await consumer.onApplicationBootstrap();
    await esperar(() => handler.mock.calls.length > 0);
    consumer.onModuleDestroy();

    expect(redisMock.xgroup).toHaveBeenCalledTimes(2); // bootstrap + recriação
    expect(redisMock.xgroup).toHaveBeenLastCalledWith(
      'CREATE',
      'stream:simulado:answers',
      'answer-processors',
      '0',
      'MKSTREAM',
    );
    expect(handler).toHaveBeenCalledWith('1-0', { histId: 'h1' });
  });

  it('keeps polling after an unexpected read error instead of stopping for good', async () => {
    const redisMock = {
      xgroup: jest.fn().mockResolvedValue('OK'),
      xreadgroup: jest
        .fn()
        .mockRejectedValueOnce(new Error('Connection is closed.'))
        .mockResolvedValue(null),
      xautoclaim: jest.fn().mockResolvedValue(null),
    };
    const consumer = new ValkeyQueueConsumer(redisMock as any);
    consumer.register(
      'stream:simulado:answers',
      'answer-processors',
      'processor-1',
      async () => {},
    );

    await consumer.onApplicationBootstrap();
    await esperar(() => redisMock.xreadgroup.mock.calls.length >= 2);
    consumer.onModuleDestroy();

    expect(redisMock.xreadgroup.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('survives the group recreation failing too (Redis still down)', async () => {
    const redisMock = {
      xgroup: jest
        .fn()
        .mockResolvedValueOnce('OK')
        .mockRejectedValueOnce(new Error('Connection is closed.'))
        .mockResolvedValue('OK'),
      xreadgroup: jest
        .fn()
        .mockRejectedValueOnce(erroNoGroup())
        .mockResolvedValue(null),
      xautoclaim: jest.fn().mockResolvedValue(null),
    };
    const consumer = new ValkeyQueueConsumer(redisMock as any);
    consumer.register(
      'stream:simulado:answers',
      'answer-processors',
      'processor-1',
      async () => {},
    );

    await consumer.onApplicationBootstrap();
    await esperar(() => redisMock.xreadgroup.mock.calls.length >= 2);
    consumer.onModuleDestroy();

    expect(redisMock.xreadgroup.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
