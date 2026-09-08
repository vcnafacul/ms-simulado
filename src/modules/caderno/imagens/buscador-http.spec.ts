import { buscarImagem } from './buscador-http';

/** Um corpo que entrega os pedaços que você mandar, como o fetch entregaria. */
const corpo = (pedacos: Buffer[]) => ({
  getReader: () => {
    let i = 0;
    return {
      read: async (): Promise<{ done: boolean; value?: Uint8Array }> =>
        i < pedacos.length
          ? { done: false, value: new Uint8Array(pedacos[i++]) }
          : { done: true, value: undefined },
      cancel: async (): Promise<void> => undefined,
    };
  },
});

const resposta = (over: any = {}) => ({
  status: 200,
  headers: { get: (): null => null },
  body: corpo([Buffer.from('ok')]),
  ...over,
});

const sempreLiberado = async () => ({ ok: true }) as const;

describe('buscarImagem', () => {
  it('devolve os bytes concatenados', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        resposta({ body: corpo([Buffer.from('ab'), Buffer.from('cd')]) }),
      );
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r).toEqual({ ok: true, buffer: Buffer.from('abcd') });
  });

  it('não busca quando o endereço é recusado', async () => {
    const fetch = jest.fn();
    const r = await buscarImagem('http://169.254.169.254/x.png', {
      fetch: fetch as any,
      verificar: async () => ({
        ok: false,
        motivo: 'endereço de imagem recusado',
      }),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, motivo: 'endereço de imagem recusado' });
  });

  it('corta durante a leitura, mesmo com Content-Length mentindo', async () => {
    // O servidor remoto informa o tamanho, e pode mentir ou omitir. Confiar
    // no cabeçalho é como um "limite" deixa passar 200 MB.
    const pedacos = Array.from({ length: 20 }, () => Buffer.alloc(1024 * 1024));
    const fetch = jest.fn().mockResolvedValue(
      resposta({
        headers: { get: () => '10' },
        body: corpo(pedacos),
      }),
    );
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
      tetoBytes: 5 * 1024 * 1024,
    });
    expect(r).toEqual({ ok: false, motivo: 'imagem grande demais' });
  });

  it('404 vira falha, não exceção', async () => {
    const fetch = jest.fn().mockResolvedValue(resposta({ status: 404 }));
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r).toEqual({ ok: false, motivo: 'imagem não pôde ser baixada' });
  });

  it('erro de rede vira falha, não exceção', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r.ok).toBe(false);
  });
});

describe('buscarImagem — conexão que cai no meio do corpo', () => {
  it('erro durante a leitura vira falha, não exceção', () => {
    // O status já veio 200 e os primeiros bytes chegaram; a conexão cai
    // depois. Sem o catch em volta da leitura, a exceção sobe e derruba a
    // geração inteira do caderno por causa de uma imagem.
    const corpoQueQuebra = {
      getReader: () => ({
        read: async (): Promise<any> => {
          throw new Error('ECONNRESET no meio do corpo');
        },
        cancel: async (): Promise<undefined> => undefined,
      }),
    };
    const fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: (): string | null => null },
      body: corpoQueQuebra,
    });
    return expect(
      buscarImagem('https://x.com/a.png', {
        fetch: fetch as any,
        verificar: sempreLiberado,
      }),
    ).resolves.toEqual({ ok: false, motivo: 'imagem não pôde ser baixada' });
  });
});

describe('buscarImagem — redirecionamento', () => {
  const redireciona = (para: string) => ({
    status: 302,
    headers: {
      get: (h: string): string | null => (h === 'location' ? para : null),
    },
    body: null as ReadableStream<Uint8Array> | null,
  });

  it('segue o redirecionamento verificando cada salto', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(redireciona('https://cdn.x.com/a.png'))
      .mockResolvedValueOnce(resposta({ body: corpo([Buffer.from('img')]) }));
    const verificar = jest.fn(sempreLiberado);
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar,
    });
    expect(r).toEqual({ ok: true, buffer: Buffer.from('img') });
    expect(verificar).toHaveBeenCalledTimes(2);
    expect(verificar).toHaveBeenLastCalledWith('https://cdn.x.com/a.png');
  });

  it('recusa o salto para endereço privado', async () => {
    // O furo mais comum desta defesa: verificar só a URL original e deixar o
    // fetch seguir o redirect sozinho. A primeira checagem passa e o destino
    // final nunca é olhado.
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(redireciona('http://169.254.169.254/'));
    const verificar = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        motivo: 'endereço de imagem recusado',
      });
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: verificar as any,
    });
    expect(r).toEqual({ ok: false, motivo: 'endereço de imagem recusado' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('desiste depois de três saltos', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(redireciona('https://x.com/outro.png'));
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r.ok).toBe(false);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('redirecionamento sem Location vira falha', async () => {
    const fetch = jest.fn().mockResolvedValue({
      status: 302,
      headers: { get: (): null => null },
      body: null as ReadableStream<Uint8Array> | null,
    });
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r.ok).toBe(false);
  });
});
