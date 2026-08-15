import { OmrHttpService } from './omr-http.service';

const env = { get: () => 'http://omr:8000' } as any;

afterEach(() => {
  (global.fetch as any) = undefined;
});

it('POST /omr/process com {imageKey}; 2xx não levanta', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
  (global as any).fetch = fetchMock;
  await new OmrHttpService(env).enviarProcessamento('cartoes/665/i.jpg');
  expect(fetchMock).toHaveBeenCalledWith(
    'http://omr:8000/omr/process',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ imageKey: 'cartoes/665/i.jpg' }),
    }),
  );
});

it('≠2xx levanta', async () => {
  (global as any).fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, status: 503 });
  await expect(
    new OmrHttpService(env).enviarProcessamento('k'),
  ).rejects.toThrow();
});
