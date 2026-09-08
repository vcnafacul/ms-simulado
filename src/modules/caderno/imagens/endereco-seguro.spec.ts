import { ehPrivado, verificarEndereco } from './endereco-seguro';

describe('ehPrivado — IPv4', () => {
  it('recusa o endereço de metadata da nuvem', () => {
    // 169.254.169.254 é o alvo clássico de SSRF: devolve credenciais da
    // instância em AWS, GCP, Azure e afins, sem autenticação nenhuma.
    expect(ehPrivado('169.254.169.254')).toBe(true);
  });

  it('recusa as faixas privadas da RFC 1918', () => {
    expect(ehPrivado('10.0.0.1')).toBe(true);
    expect(ehPrivado('172.16.0.1')).toBe(true);
    expect(ehPrivado('172.31.255.255')).toBe(true);
    expect(ehPrivado('192.168.1.1')).toBe(true);
  });

  it('recusa loopback, "este host" e broadcast', () => {
    expect(ehPrivado('127.0.0.1')).toBe(true);
    expect(ehPrivado('0.0.0.0')).toBe(true);
    expect(ehPrivado('255.255.255.255')).toBe(true);
  });

  it('recusa CGNAT', () => {
    // 100.64.0.0/10. Comum em rede de provedor e em algumas nuvens.
    expect(ehPrivado('100.64.0.1')).toBe(true);
    expect(ehPrivado('100.127.255.255')).toBe(true);
  });

  it('aceita endereço público, inclusive vizinho das faixas', () => {
    expect(ehPrivado('8.8.8.8')).toBe(false);
    expect(ehPrivado('1.1.1.1')).toBe(false);
    // 172.15 e 172.32 estão FORA da faixa privada, que é só 172.16–172.31.
    expect(ehPrivado('172.15.0.1')).toBe(false);
    expect(ehPrivado('172.32.0.1')).toBe(false);
    // 100.63 e 100.128 estão fora do CGNAT.
    expect(ehPrivado('100.63.255.255')).toBe(false);
    expect(ehPrivado('100.128.0.1')).toBe(false);
    // 169.253 e 169.255 estão fora do link-local.
    expect(ehPrivado('169.253.0.1')).toBe(false);
  });
});

describe('ehPrivado — IPv6', () => {
  it('recusa loopback, ULA e link-local', () => {
    expect(ehPrivado('::1')).toBe(true);
    expect(ehPrivado('fc00::1')).toBe(true);
    expect(ehPrivado('fd12:3456::1')).toBe(true);
    expect(ehPrivado('fe80::1')).toBe(true);
  });

  it('recusa IPv4 embrulhado em IPv6', () => {
    // ::ffff:169.254.169.254 chega ao mesmo lugar por outro caminho.
    expect(ehPrivado('::ffff:169.254.169.254')).toBe(true);
    expect(ehPrivado('::ffff:10.0.0.1')).toBe(true);
  });

  it('aceita IPv6 público', () => {
    expect(ehPrivado('2001:4860:4860::8888')).toBe(false);
  });
});

describe('verificarEndereco', () => {
  const comDns = (mapa: Record<string, string[]>) => (host: string) => {
    const ips = mapa[host];
    if (!ips) return Promise.reject(new Error('ENOTFOUND'));
    return Promise.resolve(ips.map((address) => ({ address, family: 4 })));
  };

  it('aceita host que resolve só para IP público', async () => {
    const r = await verificarEndereco(
      'https://enem.dev/a/b.png',
      comDns({ 'enem.dev': ['104.21.0.1'] }) as any,
    );
    expect(r).toEqual({ ok: true });
  });

  it('recusa host que resolve para IP privado', async () => {
    const r = await verificarEndereco(
      'http://interno.exemplo/a.png',
      comDns({ 'interno.exemplo': ['10.0.0.5'] }) as any,
    );
    expect(r).toEqual({ ok: false, motivo: 'endereço de imagem recusado' });
  });

  it('recusa se QUALQUER um dos endereços for privado', async () => {
    // O ataque: registrar o mesmo nome com um IP público e um privado, e
    // torcer para o código olhar só o primeiro.
    const r = await verificarEndereco(
      'https://misto.exemplo/a.png',
      comDns({ 'misto.exemplo': ['104.21.0.1', '169.254.169.254'] }) as any,
    );
    expect(r.ok).toBe(false);
  });

  it('recusa quando o DNS não resolve', async () => {
    const r = await verificarEndereco(
      'https://nao-existe.exemplo/a.png',
      comDns({}) as any,
    );
    expect(r.ok).toBe(false);
  });

  it('recusa IP literal privado na URL, sem sequer consultar o DNS', async () => {
    // Sem nome de host não há o que resolver; a checagem tem que olhar o
    // literal também, senão a defesa inteira se contorna trocando o nome pelo
    // endereço numérico.
    //
    // ⚠️ O resolvedor aqui MENTE de propósito: se for chamado, devolve um IP
    // público e o endereço passaria. É o que torna a decisão observável — com
    // um mock que rejeita tudo, o teste passa mesmo sem o curto-circuito do
    // literal, e não prova nada.
    const resolvedorQueMente = jest.fn(async () => [{ address: '8.8.8.8' }]);
    const r = await verificarEndereco(
      'http://169.254.169.254/latest/meta-data/',
      resolvedorQueMente as any,
    );
    expect(r.ok).toBe(false);
    expect(resolvedorQueMente).not.toHaveBeenCalled();
  });

  it('recusa URL que não dá para interpretar', async () => {
    const r = await verificarEndereco('não é url', comDns({}) as any);
    expect(r.ok).toBe(false);
  });
});
