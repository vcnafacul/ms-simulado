import { CacheDeImagens, chaveDoCache } from './cache-r2';

const storageFalso = () => {
  const objetos = new Map<string, Buffer>();
  return {
    objetos,
    get: jest.fn(async (key: string) => {
      const b = objetos.get(key);
      if (!b) throw new Error('NoSuchKey');
      return b;
    }),
    putObject: jest.fn(async (key: string, body: Buffer) => {
      objetos.set(key, body);
    }),
  };
};

describe('chaveDoCache', () => {
  it('é o sha256 da URL, sob o prefixo do caderno', () => {
    // Chave determinística dá idempotência de graça: baixar a mesma URL duas
    // vezes não cria duas cópias, e o acervo inteiro deduplica sem tabela.
    const chave = chaveDoCache('https://enem.dev/a/b.png');
    expect(chave).toMatch(/^caderno-cache\/[0-9a-f]{64}$/);
    expect(chave).toBe(chaveDoCache('https://enem.dev/a/b.png'));
  });

  it('URLs diferentes dão chaves diferentes', () => {
    expect(chaveDoCache('https://x.com/a.png')).not.toBe(
      chaveDoCache('https://x.com/b.png'),
    );
  });

  it('não leva extensão', () => {
    // O formato real sai dos magic bytes na hora de montar o zip; gravar a
    // extensão aqui seria repetir a mentira do nome da URL.
    expect(chaveDoCache('https://x.com/a.png')).not.toContain('.png');
  });
});

describe('CacheDeImagens', () => {
  it('devolve null quando não tem', async () => {
    const storage = storageFalso();
    const cache = new CacheDeImagens(storage as any);
    expect(await cache.ler('https://x.com/a.png')).toBeNull();
  });

  it('grava e depois lê', async () => {
    const storage = storageFalso();
    const cache = new CacheDeImagens(storage as any);
    await cache.gravar('https://x.com/a.png', Buffer.from('bytes'));
    expect(await cache.ler('https://x.com/a.png')).toEqual(
      Buffer.from('bytes'),
    );
  });

  it('grava sem bucket explícito, no bucket do próprio serviço', async () => {
    // O QUESTAO_BUCKET é credencial de LEITURA APENAS. Escrever o cache lá
    // falharia em produção com um erro de permissão que ninguém liga a isto.
    const storage = storageFalso();
    const cache = new CacheDeImagens(storage as any);
    await cache.gravar('https://x.com/a.png', Buffer.from('b'));
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringContaining('caderno-cache/'),
      expect.any(Buffer),
      'application/octet-stream',
    );
  });

  it('falha de leitura no cache não derruba: devolve null', async () => {
    const storage = storageFalso();
    storage.get = jest.fn(async (key: string): Promise<Buffer> => {
      throw new Error(`rede caiu ao ler ${key}`);
    });
    const cache = new CacheDeImagens(storage as any);
    expect(await cache.ler('https://x.com/a.png')).toBeNull();
  });

  it('falha de escrita no cache não derruba: só não cacheia', async () => {
    // O cache é otimização. Não poder gravar não pode impedir a prova de sair.
    const storage = storageFalso();
    storage.putObject = jest.fn(
      async (key: string, body: Buffer): Promise<void> => {
        throw new Error(
          `sem permissão para gravar ${key} (${body.length} bytes)`,
        );
      },
    );
    const cache = new CacheDeImagens(storage as any);
    await expect(
      cache.gravar('https://x.com/a.png', Buffer.from('b')),
    ).resolves.toBeUndefined();
  });
});
