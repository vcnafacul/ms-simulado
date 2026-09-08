import { ColetorDeImagens } from './imagens';
import { textoParaLatex } from './texto-para-latex';

const converter = (texto: string) => {
  const coletor = new ColetorDeImagens();
  const avisos: string[] = [];
  const latex = textoParaLatex(texto, coletor, (a) => avisos.push(a));
  return { latex, coletor, avisos };
};

describe('textoParaLatex — o texto comum', () => {
  it('escapa o que precisa e deixa o resto literal', () => {
    // A premissa da POC afirmada como teste: markdown entra literal.
    expect(converter('100% dos casos & mais').latex).toBe(
      '100\\% dos casos \\& mais',
    );
    expect(converter('isto é **negrito** aqui').latex).toBe(
      'isto é **negrito** aqui',
    );
  });

  it('deixa a matemática intacta, via card 01', () => {
    expect(converter('a função $f(x) = x^2$ tem').latex).toBe(
      'a função $f(x) = x^2$ tem',
    );
  });

  it('não abre fórmula em dinheiro, via card 01', () => {
    expect(converter('custa R$ 12,00 e o outro $x$').latex).toBe(
      'custa R\\$ 12,00 e o outro $x$',
    );
  });

  it('string vazia e undefined devolvem vazio', () => {
    expect(converter('').latex).toBe('');
    const coletor = new ColetorDeImagens();
    expect(textoParaLatex(undefined, coletor, () => {})).toBe('');
  });
});

describe('textoParaLatex — imagens', () => {
  it('URL externa vira includegraphics como parágrafo próprio', () => {
    const { latex, coletor } = converter(
      '![](https://enem.dev/2016/questions/3/abc.png)',
    );
    expect(latex).toBe(
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01}\n\n',
    );
    expect(coletor.imagens[0].origem).toBe('url');
  });

  it('separa a imagem do texto colado nela', () => {
    // No acervo a imagem vem colada. Inline, o LaTeX mete a figura dentro da
    // linha e a linha fica da altura dela numa coluna de 8 cm.
    const { latex } = converter(
      '![](https://x.com/a.png)Os moradores de Andalsnes, na Noruega',
    );
    expect(latex).toBe(
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01}\n\nOs moradores de Andalsnes, na Noruega',
    );
  });

  it('asset:// guarda a key com o prefixo', () => {
    const { coletor } = converter(
      '![](asset://assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg)',
    );
    expect(coletor.imagens[0]).toEqual({
      origem: 'r2',
      key: 'assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg',
      arquivo: 'assets/01',
    });
  });

  it('img com width converte px para pt', () => {
    const { latex } = converter(
      '<img src="https://x.com/a.png" alt="mapa" width="320" height="200" />',
    );
    expect(latex).toBe(
      '\n\n\\includegraphics[width=240pt,max width=\\linewidth]{assets/01}\n\n',
    );
  });

  it('img sem width cai no teto da coluna', () => {
    const { latex } = converter('<img src="https://x.com/a.png" alt="" />');
    expect(latex).toContain('\\includegraphics[max width=\\linewidth]');
  });

  it('imagem recusada vira marcador visível e aviso', () => {
    const { latex, avisos, coletor } = converter(
      'antes ![](ftp://x.com/a.png) depois',
    );
    expect(latex).toBe('antes \n\n\\textbf{[imagem indisponível]}\n\n depois');
    expect(avisos).toEqual(['imagem recusada: esquema não aceito']);
    expect(coletor.imagens).toHaveLength(0);
  });

  it('o alt é descartado, inclusive quando tem caractere especial', () => {
    // \includegraphics não tem legenda, e no acervo real o alt vem vazio.
    // Se fosse mantido sem escape, um `%` no alt apagaria a linha.
    const { latex } = converter('![100% do mapa](https://x.com/a.png)');
    expect(latex).not.toContain('100');
    expect(latex).toContain('assets/01');
  });

  it('o contador é do coletor, então continua entre campos', () => {
    const coletor = new ColetorDeImagens();
    textoParaLatex('![](https://x.com/a.png)', coletor, () => {});
    const segundo = textoParaLatex(
      '![](https://x.com/b.png)',
      coletor,
      () => {},
    );
    expect(segundo).toContain('assets/02');
  });
});

describe('textoParaLatex — img sem src', () => {
  it('deixa a tag literal em vez de virar imagem', () => {
    // Sem `src` não há referência nenhuma para registrar. A tag fica como
    // texto escapado, visível — coerente com o resto da POC: o que não dá para
    // resolver aparece, não some.
    const { latex, coletor, avisos } = converter('<img alt="sem fonte" />');
    expect(coletor.imagens).toHaveLength(0);
    expect(avisos).toEqual([]);
    expect(latex).toContain('\\textless{}img');
  });
});

describe('textoParaLatex — o div de alinhamento', () => {
  it('some, e o conteúdo fica', () => {
    const { latex } = converter(
      '<div style="text-align: right">Fonte: IBGE</div>',
    );
    expect(latex).toBe('Fonte: IBGE');
  });

  it('some também em volta de imagem', () => {
    const { latex } = converter(
      '<div style="text-align: center"><img src="https://x.com/a.png" /></div>',
    );
    expect(latex).toBe(
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01}\n\n',
    );
  });

  it('dois divs no mesmo campo não se misturam', () => {
    // O não-guloso é o que impede o primeiro <div> de casar com o último
    // </div> e engolir o texto do meio.
    const { latex } = converter(
      '<div style="text-align: center">um</div>meio<div style="text-align: right">dois</div>',
    );
    expect(latex).toBe('ummeiodois');
  });

  it('</div> órfão fica literal, escapado', () => {
    // HTML que não veio do nosso editor deve aparecer, não sumir.
    const { latex } = converter('texto</div>');
    expect(latex).toBe('texto\\textless{}/div\\textgreater{}');
  });
});
