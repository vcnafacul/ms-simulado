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

it('⚠️ manda o tentativaId no corpo', async () => {
  // Sem isto o token nunca sai daqui, o ms-omr devolve `null`, e a guarda do
  // callback aceita tudo — o card inteiro vira no-op silencioso.
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
  (global as any).fetch = fetchMock;

  await new OmrHttpService(env).enviarProcessamento('cartoes/1/a.jpg', 'T1');

  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toEqual({ imageKey: 'cartoes/1/a.jpg', tentativaId: 'T1' });
});

it('sem token, o corpo continua o de antes (ms-omr aceita)', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
  (global as any).fetch = fetchMock;

  await new OmrHttpService(env).enviarProcessamento('cartoes/1/a.jpg');

  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toEqual({ imageKey: 'cartoes/1/a.jpg' });
});
