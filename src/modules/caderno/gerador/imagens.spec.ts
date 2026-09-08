import {
  ColetorDeImagens,
  ImagemAceita,
  ImagemRecusada,
  emitirImagem,
  emitirMarcador,
} from './imagens';

// `registrar` devolve `ImagemAceita | ImagemRecusada`, sem discriminante
// compartilhado, então TS não deixa acessar `.arquivo` direto no union.
//
// Estreita de verdade em vez de fazer cast: um cast devolveria `undefined`
// caladamente se o coletor passasse a recusar o que não devia, e a falha
// apareceria como `undefined !== 'assets/01.png'`. Assim a mensagem diz o
// motivo da recusa.
const arquivoDe = (r: ImagemAceita | ImagemRecusada): string => {
  if ('motivo' in r) {
    throw new Error(`esperava imagem aceita, veio recusa: ${r.motivo}`);
  }
  return r.arquivo;
};

describe('ColetorDeImagens — o que reconhece', () => {
  it('aceita URL externa, que é o caso dominante do acervo', () => {
    // ~100% do acervo é assim, com alt vazio.
    const c = new ColetorDeImagens();
    const r = c.registrar(
      'https://enem.dev/2016/questions/3/812288c1-3e37-4369-914a-057525abd52e.png',
    );
    expect(r).toEqual({ arquivo: 'assets/01.png' });
    expect(c.imagens).toEqual([
      {
        origem: 'url',
        url: 'https://enem.dev/2016/questions/3/812288c1-3e37-4369-914a-057525abd52e.png',
        arquivo: 'assets/01.png',
      },
    ]);
  });

  it('aceita asset:// e guarda a key inteira, com o prefixo', () => {
    // `assets/` é o prefixo REAL da key no R2 (uploadAsset passa 'assets'),
    // não enfeite do protocolo. Perder o prefixo quebraria o card 03.
    const c = new ColetorDeImagens();
    const r = c.registrar(
      'asset://assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg',
    );
    expect(r).toEqual({ arquivo: 'assets/01.jpeg' });
    expect(c.imagens[0]).toEqual({
      origem: 'r2',
      key: 'assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg',
      arquivo: 'assets/01.jpeg',
    });
  });

  it('tira query e fragmento antes de ler a extensão', () => {
    const c = new ColetorDeImagens();
    expect(c.registrar('https://x.com/a/b.png?v=2&w=3')).toEqual({
      arquivo: 'assets/01.png',
    });
    expect(c.registrar('https://x.com/a/c.jpg#topo')).toEqual({
      arquivo: 'assets/02.jpg',
    });
  });
});

describe('ColetorDeImagens — numeração e dedup', () => {
  it('numera na ordem de aparição, contínuo no caderno inteiro', () => {
    // O contador NÃO reinicia por questão: o zip é um só.
    const c = new ColetorDeImagens();
    expect(arquivoDe(c.registrar('https://x.com/a.png'))).toBe('assets/01.png');
    expect(arquivoDe(c.registrar('https://x.com/b.png'))).toBe('assets/02.png');
    expect(arquivoDe(c.registrar('https://x.com/c.png'))).toBe('assets/03.png');
  });

  it('deduplica por identidade da origem', () => {
    const c = new ColetorDeImagens();
    const um = c.registrar('asset://assets/k.png');
    const dois = c.registrar('asset://assets/k.png');
    expect(dois).toEqual(um);
    expect(c.imagens).toHaveLength(1);
  });

  it('não confunde URL com key parecida', () => {
    const c = new ColetorDeImagens();
    c.registrar('https://x.com/k.png');
    c.registrar('asset://assets/k.png');
    expect(c.imagens).toHaveLength(2);
  });

  it('passa de 99 sem sobrescrever', () => {
    // padStart(2), não truncado em dois dígitos: um caderno de 90 questões
    // passa de 99 imagens fácil, e truncar faria a 100 sobrescrever a 00.
    const c = new ColetorDeImagens();
    for (let i = 1; i <= 100; i += 1) c.registrar(`https://x.com/${i}.png`);
    expect(c.imagens[98].arquivo).toBe('assets/99.png');
    expect(c.imagens[99].arquivo).toBe('assets/100.png');
  });
});

describe('ColetorDeImagens — o que recusa', () => {
  it('recusa extensão que quebraria o grupo do \\includegraphics', () => {
    // s3-service.ts monta a extensão com originalname.split('.').pop(), sem
    // filtro. `mapa.p}ng` produz key terminada em `}`, que fecha o grupo cedo
    // e derrama o resto como LaTeX solto.
    const c = new ColetorDeImagens();
    expect(c.registrar('asset://assets/mapa.p}ng')).toEqual({
      motivo: 'extensão inválida',
    });
    expect(c.imagens).toHaveLength(0);
  });

  it('recusa quando não há extensão nenhuma', () => {
    const c = new ColetorDeImagens();
    expect(c.registrar('https://x.com/sem-extensao')).toEqual({
      motivo: 'extensão inválida',
    });
  });

  it('recusa esquema fora de http, https e asset', () => {
    // O card 03 fará requisição de SAÍDA para esta URL, vinda do texto de uma
    // questão. Fechar a lista aqui é o que impede o desenho clássico de SSRF.
    const c = new ColetorDeImagens();
    expect(c.registrar('ftp://x.com/a.png')).toEqual({
      motivo: 'esquema não aceito',
    });
    expect(c.registrar('javascript:alert(1)')).toEqual({
      motivo: 'esquema não aceito',
    });
    expect(c.registrar('file:///etc/passwd.png')).toEqual({
      motivo: 'esquema não aceito',
    });
    expect(c.imagens).toHaveLength(0);
  });
});

describe('emitirImagem', () => {
  it('emite como parágrafo próprio, com o teto da coluna', () => {
    expect(emitirImagem('assets/01.png', undefined)).toBe(
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01.png}\n\n',
    );
  });

  it('converte px para pt a 0,75 e mantém o teto atrás', () => {
    // CSS define 1px = 1/96 in e 1pt = 1/72 in. O teto vem DEPOIS para que
    // uma conversão errada encolha, em vez de estourar a coluna de 8 cm.
    expect(emitirImagem('assets/02.jpeg', 320)).toBe(
      '\n\n\\includegraphics[width=240pt,max width=\\linewidth]{assets/02.jpeg}\n\n',
    );
  });

  it('arredonda a largura', () => {
    expect(emitirImagem('assets/03.png', 101)).toContain('width=76pt');
  });

  it('marcador visível quando a imagem foi recusada', () => {
    expect(emitirMarcador()).toBe('\n\n\\textbf{[imagem indisponível]}\n\n');
  });
});
