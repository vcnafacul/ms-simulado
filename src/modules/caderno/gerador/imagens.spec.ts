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
    expect(r).toEqual({ arquivo: 'assets/01' });
    expect(c.imagens).toEqual([
      {
        origem: 'url',
        url: 'https://enem.dev/2016/questions/3/812288c1-3e37-4369-914a-057525abd52e.png',
        arquivo: 'assets/01',
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
    expect(r).toEqual({ arquivo: 'assets/01' });
    expect(c.imagens[0]).toEqual({
      origem: 'r2',
      key: 'assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg',
      arquivo: 'assets/01',
    });
  });

  it('tira query e fragmento antes de ler a extensão', () => {
    const c = new ColetorDeImagens();
    expect(c.registrar('https://x.com/a/b.png?v=2&w=3')).toEqual({
      arquivo: 'assets/01',
    });
    expect(c.registrar('https://x.com/a/c.jpg#topo')).toEqual({
      arquivo: 'assets/02',
    });
  });
});

describe('ColetorDeImagens — numeração e dedup', () => {
  it('numera na ordem de aparição, contínuo no caderno inteiro', () => {
    // O contador NÃO reinicia por questão: o zip é um só.
    const c = new ColetorDeImagens();
    expect(arquivoDe(c.registrar('https://x.com/a.png'))).toBe('assets/01');
    expect(arquivoDe(c.registrar('https://x.com/b.png'))).toBe('assets/02');
    expect(arquivoDe(c.registrar('https://x.com/c.png'))).toBe('assets/03');
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
    expect(c.imagens[98].arquivo).toBe('assets/99');
    expect(c.imagens[99].arquivo).toBe('assets/100');
  });
});

describe('ColetorDeImagens — o que recusa', () => {
  it('aceita referência sem extensão, porque quem decide são os bytes', () => {
    // A extensão do nome mente: um `.png` que serve JPEG faz o graphicx
    // escolher o driver errado. O card 03 nomeia o arquivo pelos magic bytes,
    // e por isso o `.tex` não carrega extensão nenhuma.
    const c = new ColetorDeImagens();
    expect(c.registrar('https://x.com/sem-extensao')).toEqual({
      arquivo: 'assets/01',
    });
  });

  it('o caminho emitido não carrega byte nenhum vindo do usuário', () => {
    // Era a única superfície de injeção que restava: `mapa.p}ng` fecharia o
    // grupo do \includegraphics cedo e derramaria o resto do documento como
    // LaTeX solto. Sem extensão no caminho emitido, deixa de ser POSSÍVEL em
    // vez de ser barrada.
    //
    // ⚠️ A key crua CONTINUA guardada em `imagens[]`, com `}` e tudo — é com
    // ela que o card 03 busca os bytes no R2, e lá ela é chave de objeto, não
    // LaTeX. O que não pode vazar é o `arquivo`.
    const c = new ColetorDeImagens();
    const r = c.registrar('asset://assets/mapa.p}ng');
    expect(r).toEqual({ arquivo: 'assets/01' });
    expect((c.imagens[0] as { key: string }).key).toBe('assets/mapa.p}ng');
  });

  it('o nome no .tex é sempre gerado por nós, nunca derivado da referência', () => {
    const c = new ColetorDeImagens();
    for (const ref of [
      'asset://assets/mapa.p}ng',
      'https://x.com/a b/c%20d.png?q=1#f',
      'https://x.com/sem-extensao',
    ]) {
      const r = c.registrar(ref) as { arquivo: string };
      expect(r.arquivo).toMatch(/^assets\/\d+$/);
    }
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
