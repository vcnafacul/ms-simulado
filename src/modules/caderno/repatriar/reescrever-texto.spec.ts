import { acharUrlsExternas, chaveDaUrl, trocarUrl } from './reescrever-texto';

describe('acharUrlsExternas', () => {
  it('acha nos dois construtos', () => {
    expect(
      acharUrlsExternas(
        '![](https://enem.dev/a.png) e <img src="https://x.com/b.jpg" />',
      ),
    ).toEqual(['https://enem.dev/a.png', 'https://x.com/b.jpg']);
  });

  it('ignora o que já foi repatriado', () => {
    // Idempotência: rodar duas vezes não pode achar nada na segunda.
    expect(acharUrlsExternas('![](asset://assets/abc.png)')).toEqual([]);
  });

  it('ignora referência que não é http', () => {
    expect(
      acharUrlsExternas('![](img1) ![](data:image/png;base64,AAA)'),
    ).toEqual([]);
  });

  it('texto sem imagem devolve vazio', () => {
    expect(
      acharUrlsExternas('Enunciado com http://fonte.com citada em prosa'),
    ).toEqual([]);
  });

  it('a mesma URL duas vezes aparece duas vezes', () => {
    // Quem deduplica é o chamador; aqui é fiel ao texto.
    const t = '![](https://x.com/a.png) ![](https://x.com/a.png)';
    expect(acharUrlsExternas(t)).toHaveLength(2);
  });
});

describe('chaveDaUrl', () => {
  it('é determinística e leva a extensão', () => {
    // ⚠️ Determinística é o que sustenta a ordem de escrita: se a gravação da
    // questão falhar, a re-execução acha o objeto e não rebaixa.
    const a = chaveDaUrl('https://enem.dev/a.png', 'png');
    expect(a).toBe(chaveDaUrl('https://enem.dev/a.png', 'png'));
    expect(a).toMatch(/^assets\/[0-9a-f]{64}\.png$/);
  });

  it('URLs diferentes dão chaves diferentes', () => {
    expect(chaveDaUrl('https://x.com/a.png', 'png')).not.toBe(
      chaveDaUrl('https://x.com/b.png', 'png'),
    );
  });
});

describe('trocarUrl', () => {
  it('troca todas as ocorrências daquela URL', () => {
    // ⚠️ Chave com o tamanho REAL (64 hex), e não uma abreviada. Com chave
    // curta, o delta de comprimento entre a URL e a substituição é pequeno o
    // bastante para o off-by-one da ordem errada se auto-cancelar — e o teste
    // passa sem provar nada. Medido.
    const CHAVE = `assets/${'a'.repeat(64)}.png`;
    const URL = 'https://enem.dev/2016/questions/3/abc.png';
    const t = `![](${URL}) meio ![](${URL}) fim`;
    expect(trocarUrl(t, URL, CHAVE)).toBe(
      `![](asset://${CHAVE}) meio ![](asset://${CHAVE}) fim`,
    );
  });

  it('troca dentro de <img src>', () => {
    expect(
      trocarUrl(
        '<img src="https://x.com/a.png" width="320" />',
        'https://x.com/a.png',
        'assets/K.png',
      ),
    ).toBe('<img src="asset://assets/K.png" width="320" />');
  });

  it('não toca em outra URL parecida', () => {
    // ⚠️ Substituição por string simples pegaria o prefixo: trocar
    // `https://x.com/a.png` não pode afetar `https://x.com/a.png.bak`.
    const t = '![](https://x.com/a.png) ![](https://x.com/a.png.bak)';
    const r = trocarUrl(t, 'https://x.com/a.png', 'assets/K.png');
    expect(r).toContain('![](asset://assets/K.png)');
    expect(r).toContain('![](https://x.com/a.png.bak)');
  });

  it('não toca na URL citada em prosa', () => {
    // Só dentro de construto de imagem. A linha "Disponível em: http://…" que
    // toda questão do ENEM tem NÃO é imagem.
    const t =
      'Veja ![](https://x.com/a.png)\n\nDisponível em: https://x.com/a.png. Acesso em 2025.';
    const r = trocarUrl(t, 'https://x.com/a.png', 'assets/K.png');
    expect(r).toContain('Disponível em: https://x.com/a.png. Acesso');
    expect(r).toContain('![](asset://assets/K.png)');
  });

  it('URL ausente devolve o texto intacto', () => {
    expect(trocarUrl('nada aqui', 'https://x.com/a.png', 'assets/K.png')).toBe(
      'nada aqui',
    );
  });
});
