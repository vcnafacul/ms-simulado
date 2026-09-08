import { ImagemRef } from '../gerador/tipos';
import { ResolverDeImagens } from './resolver';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = Buffer.from('GIF89a-resto');

const montar = (over: any = {}) => {
  const noBucket = new Map<string, Buffer>(over.bucket ?? []);
  const noCache = new Map<string, Buffer>();
  const storage = {
    get: jest.fn(async (key: string, bucket?: string) => {
      const onde = bucket ? noBucket : noCache;
      const b = onde.get(key);
      if (!b) throw new Error('NoSuchKey');
      return b;
    }),
    putObject: jest.fn(async (key: string, body: Buffer) => {
      noCache.set(key, body);
    }),
  };
  const env = { get: () => 'bucket-de-questoes' };
  const buscar =
    over.buscar ?? jest.fn(async () => ({ ok: true, buffer: PNG }));
  const resolver = new ResolverDeImagens(storage as any, env as any);
  (resolver as any).buscar = buscar;
  return { resolver, storage, buscar, noCache };
};

const url = (u: string, arquivo: string): ImagemRef => ({
  origem: 'url',
  url: u,
  arquivo,
});
const r2 = (key: string, arquivo: string): ImagemRef => ({
  origem: 'r2',
  key,
  arquivo,
});

describe('ResolverDeImagens — origem r2', () => {
  it('lê do QUESTAO_BUCKET, não do bucket do serviço', async () => {
    const { resolver, storage } = montar({
      bucket: [['assets/x.png', PNG]],
    });
    const res = await resolver.resolver([r2('assets/x.png', 'assets/01')]);
    expect(storage.get).toHaveBeenCalledWith(
      'assets/x.png',
      'bucket-de-questoes',
    );
    expect(res.arquivos).toEqual([{ nome: 'assets/01.png', buffer: PNG }]);
    expect(res.metricas.doBucket).toBe(1);
  });

  it('key inexistente vira placeholder e aviso, sem exceção', async () => {
    const { resolver } = montar();
    const res = await resolver.resolver([r2('assets/sumiu.png', 'assets/01')]);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
    expect(res.avisos).toEqual(['assets/01 — imagem não encontrada no acervo']);
    expect(res.metricas.falhas).toBe(1);
  });
});

describe('ResolverDeImagens — origem url', () => {
  it('cache frio: busca uma vez e grava', async () => {
    const { resolver, buscar, noCache } = montar();
    const res = await resolver.resolver([
      url('https://x.com/a.png', 'assets/01'),
    ]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(noCache.size).toBe(1);
    expect(res.metricas.daInternet).toBe(1);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
  });

  it('cache quente: não busca', async () => {
    const { resolver, buscar } = montar();
    await resolver.resolver([url('https://x.com/a.png', 'assets/01')]);
    (buscar as jest.Mock).mockClear();

    const res = await resolver.resolver([
      url('https://x.com/a.png', 'assets/07'),
    ]);
    expect(buscar).not.toHaveBeenCalled();
    expect(res.metricas.doCache).toBe(1);
    expect(res.metricas.daInternet).toBe(0);
  });

  it('a mesma URL em duas refs busca uma vez só', async () => {
    const { resolver, buscar } = montar();
    const res = await resolver.resolver([
      url('https://x.com/a.png', 'assets/01'),
      url('https://x.com/a.png', 'assets/02'),
    ]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(res.arquivos.map((a: { nome: string }) => a.nome)).toEqual([
      'assets/01.png',
      'assets/02.png',
    ]);
  });

  it('busca recusada vira placeholder com o motivo', async () => {
    const { resolver } = montar({
      buscar: jest.fn(async () => ({
        ok: false,
        motivo: 'endereço de imagem recusado',
      })),
    });
    const res = await resolver.resolver([
      url('http://169.254.169.254/x.png', 'assets/01'),
    ]);
    expect(res.avisos).toEqual(['assets/01 — endereço de imagem recusado']);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
  });
});

describe('ResolverDeImagens — formato', () => {
  it('nomeia pelos magic bytes, não pela URL', async () => {
    // A URL diz .png e os bytes são JPEG. Quem manda são os bytes: o graphicx
    // escolhe o driver pela extensão do arquivo no zip.
    const { resolver } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: JPEG })),
    });
    const res = await resolver.resolver([
      url('https://x.com/a.png', 'assets/01'),
    ]);
    expect(res.arquivos[0].nome).toBe('assets/01.jpeg');
  });

  it('GIF vira placeholder, porque o pdflatex não inclui', async () => {
    const { resolver } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: GIF })),
    });
    const res = await resolver.resolver([
      url('https://x.com/a.gif', 'assets/01'),
    ]);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
    expect(res.avisos).toEqual(['assets/01 — formato de imagem não suportado']);
  });

  it('não cacheia o que não vai usar', async () => {
    const { resolver, noCache } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: GIF })),
    });
    await resolver.resolver([url('https://x.com/a.gif', 'assets/01')]);
    expect(noCache.size).toBe(0);
  });
});

describe('ResolverDeImagens — tetos e bordas', () => {
  it('lista vazia devolve resultado vazio, sem chamar nada', async () => {
    const { resolver, storage, buscar } = montar();
    const res = await resolver.resolver([]);
    expect(res.arquivos).toEqual([]);
    expect(res.avisos).toEqual([]);
    expect(storage.get).not.toHaveBeenCalled();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('estourado o teto agregado, o resto vira placeholder', async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const { resolver } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: grande })),
    });
    const refs = Array.from({ length: 20 }, (_, i) =>
      url(`https://x.com/${i}.png`, `assets/${i}`),
    );
    const res = await resolver.resolver(refs);
    expect(res.arquivos).toHaveLength(20);
    expect(
      res.avisos.some((a: string) => a.includes('limite de imagens')),
    ).toBe(true);
    expect(res.metricas.bytes).toBeLessThanOrEqual(40 * 1024 * 1024);
  });

  it('sem QUESTAO_BUCKET, falha com mensagem explícita', async () => {
    const { resolver } = montar();
    (resolver as any).env = { get: (): undefined => undefined };
    await expect(
      resolver.resolver([r2('assets/x.png', 'assets/01')]),
    ).rejects.toThrow(/QUESTAO_BUCKET/);
  });
});
