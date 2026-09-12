import JSZip from 'jszip';
import { zipCom } from './__fixtures__/zip';
import { extrairTemplateDoZip, LIMITES, nomePerigoso } from './extrair-zip';

const PROJETO_OVERLEAF = {
  'main.tex': '\\documentclass{exam}',
  'preambulo.tex': '\\usepackage{amsmath}',
  'conteudo.tex': '\\question mock',
  'metadados.tex': '\\def\\cadernoTitulo{mock}',
  'assets/01.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'main.pdf': Buffer.from('%PDF-1.5'),
  'main.aux': '\\relax',
};

describe('extrairTemplateDoZip — o caminho real', () => {
  it('pega os dois e lista o resto em ignorados', async () => {
    const r = await extrairTemplateDoZip(await zipCom(PROJETO_OVERLEAF));

    expect(r.ok).toBe(true);
    if (r.ok === false) return; // ⚠️ strictNullChecks:false não estreita por negação
    expect(Object.keys(r.arquivos).sort()).toEqual([
      'main.tex',
      'preambulo.tex',
    ]);
    expect(r.arquivos['main.tex']).toBe('\\documentclass{exam}');
    expect(r.ignorados).toEqual(
      expect.arrayContaining(['conteudo.tex', 'main.pdf', 'assets/01.png']),
    );
  });

  it('zip com o nome do projeto como pasta raiz funciona igual', async () => {
    // ⚠️ É como o Overleaf entrega dependendo de onde a pessoa clica.
    const r = await extrairTemplateDoZip(
      await zipCom({
        'Caderno v2/main.tex': '\\documentclass{exam}',
        'Caderno v2/preambulo.tex': '\\usepackage{amsmath}',
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('`Main.tex` maiúsculo é aceito', async () => {
    const r = await extrairTemplateDoZip(
      await zipCom({ 'Main.tex': 'a', 'PREAMBULO.TeX': 'b' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok === false) return;
    // ⚠️ A chave normaliza: quem consome não deve descobrir a caixa do upload.
    expect(Object.keys(r.arquivos).sort()).toEqual([
      'main.tex',
      'preambulo.tex',
    ]);
  });
});

describe('extrairTemplateDoZip — o que recusa', () => {
  it('sem preambulo.tex → erro NOMEANDO o que faltou', async () => {
    const r = await extrairTemplateDoZip(await zipCom({ 'main.tex': 'a' }));
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toContain('preambulo.tex');
    // ⚠️ Não pode citar o que ESTAVA lá — mandaria a pessoa procurar o certo.
    expect(r.erro).not.toContain('main.tex');
  });

  it('sem nenhum dos dois → nomeia os dois', async () => {
    const r = await extrairTemplateDoZip(await zipCom({ 'leia.txt': 'a' }));
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toContain('main.tex');
    expect(r.erro).toContain('preambulo.tex');
  });

  it.each([
    ['../x.tex', 'travessia com ..'],
    ['a/../../x.tex', '.. no meio'],
    ['/etc/passwd', 'caminho absoluto'],
    ['ma\u0001in.tex', 'caractere de controle'],
  ])('entrada %s (%s) → rejeita o ZIP INTEIRO', async (nome) => {
    // ⚠️ Rejeita tudo, não só a entrada ruim. Nome de arquivo vindo de upload
    // é path traversal na montagem do zip da prova, no card 11 — e um zip com
    // uma entrada dessas não é um zip do Overleaf, é outra coisa.
    const r = await extrairTemplateDoZip(
      await zipCom({
        'main.tex': 'a',
        'preambulo.tex': 'b',
        [nome]: 'x',
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('zip acima de 5 MB → recusa SEM descompactar', async () => {
    // ⚠️ O buffer aqui já é grande; o que se prova é que a decisão sai antes
    // de qualquer leitura de entrada.
    const grande = Buffer.alloc(LIMITES.zipBytes + 1);
    const r = await extrairTemplateDoZip(grande);
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toMatch(/5 MB|tamanho/i);
  });

  it('mais de 200 entradas → recusa sem ler o conteúdo delas', async () => {
    const muitas: Record<string, string> = {
      'main.tex': 'a',
      'preambulo.tex': 'b',
    };
    for (let i = 0; i < LIMITES.entradas + 1; i += 1) muitas[`f${i}.txt`] = 'x';

    const r = await extrairTemplateDoZip(await zipCom(muitas));
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toMatch(/entradas/i);
  });

  it('arquivo de texto acima de 256 KB → recusa', async () => {
    const r = await extrairTemplateDoZip(
      await zipCom({
        'main.tex': 'x'.repeat(LIMITES.arquivoBytes + 1),
        'preambulo.tex': 'b',
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toContain('main.tex');
  });

  it('bytes não-UTF-8 → mensagem clara, e não texto corrompido', async () => {
    // ⚠️ 0xFF nunca é UTF-8 válido. Sem esta checagem entra um U+FFFD
    // silencioso no lugar do caractere — e a prova sai com um losango preto.
    const r = await extrairTemplateDoZip(
      await zipCom({
        'main.tex': Buffer.from([0x61, 0xff, 0x62]),
        'preambulo.tex': 'b',
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toMatch(/UTF-8/i);
    expect(r.erro).toContain('main.tex');
  });

  it('buffer que não é zip → erro claro, sem estourar', async () => {
    const r = await extrairTemplateDoZip(Buffer.from('isto não é um zip'));
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.erro).toMatch(/zip/i);
  });
});

describe('extrairTemplateDoZip — a ordem, provada por instrumentação', () => {
  it('acima do limite, o zip nem chega a ser aberto', async () => {
    const espiao = jest.spyOn(JSZip, 'loadAsync');
    await extrairTemplateDoZip(Buffer.alloc(LIMITES.zipBytes + 1));
    expect(espiao).not.toHaveBeenCalled();
    espiao.mockRestore();
  });
});

describe('nomePerigoso — a regra testada direto, na função', () => {
  // ⚠️ Estes testes chamam a FUNÇÃO, não o pipeline, e isso é de propósito.
  // A regra de `..` é inalcançável por um zip de verdade: o jszip resolve os
  // nomes na leitura (ver o teste de contrato abaixo). Testar pelo pipeline
  // seria fingir que um zip a alcança; testar direto prova que ela funciona.

  it.each([
    ['../x.tex', 'travessia com ..'],
    ['a/../../x.tex', '.. no meio'],
    ['/etc/passwd', 'barra inicial'],
    ['C:/x.tex', 'letra de unidade'],
    ['ma\u0001in.tex', 'caractere de controle'],
  ])('%s (%s) é perigoso', (caminho) => {
    expect(nomePerigoso(caminho)).toBe(true);
  });

  it.each([
    ['main.tex', 'na raiz'],
    ['sub/arquivo.tex', 'em subpasta'],
    // ⚠️ Mostra que a regra olha SEGMENTO, não substring: `..b` começa com
    // dois pontos e não é travessia nenhuma.
    ['..b/c', 'segmento que apenas começa com dois pontos'],
  ])('%s (%s) não é perigoso', (caminho) => {
    expect(nomePerigoso(caminho)).toBe(false);
  });
});

describe('contrato com o jszip', () => {
  it('o jszip sanitiza `..` na LEITURA, e é por isso que a regra de `..` é inalcançável', async () => {
    // ⚠️ ESTE TESTE GUARDA UMA PREMISSA, NÃO UM COMPORTAMENTO NOSSO.
    //
    // Se ele quebrar depois de um upgrade do jszip, a consequência é:
    // **a regra de `..` em `nomePerigoso` virou alcançável** — passou a existir
    // um zip real capaz de entregar um segmento `..` para o nosso código. Aí
    // escreva o teste de integração que hoje é impossível (um zip com `../x.tex`
    // atravessando `extrairTemplateDoZip` inteiro) e apague este.
    //
    // ⚠️ Os bytes são mexidos na mão porque não existe outro jeito. O
    // `zip.file()` do jszip normaliza o nome na ESCRITA, então pedir
    // `../x.tex` a ele produz `x.tex` e o fixture testaria outra coisa. O
    // contorno: gravar com um nome de MESMO COMPRIMENTO e trocar os bytes
    // depois. O nome aparece duas vezes (local file header e central
    // directory); trocando as duas por uma string de tamanho idêntico, os
    // campos de comprimento, os offsets e os CRCs seguem válidos — o zip
    // continua bem-formado, só com o nome perigoso.
    const DE = Buffer.from('zz/x.tex'); // 8 bytes
    const PARA = Buffer.from('../x.tex'); // 8 bytes
    expect(PARA.length).toBe(DE.length);

    const buffer = await zipCom({
      'main.tex': 'a',
      'preambulo.tex': 'b',
      'zz/x.tex': 'x',
    });

    let trocas = 0;
    for (let i = buffer.indexOf(DE); i !== -1; i = buffer.indexOf(DE, i + 8)) {
      PARA.copy(buffer, i);
      trocas += 1;
    }
    expect(trocas).toBe(2); // local file header + central directory
    // O arquivo em memória agora carrega mesmo o nome perigoso. Sem esta
    // asserção o teste poderia estar guardando um fixture que não ficou
    // perigoso coisa nenhuma.
    expect(buffer.includes(PARA)).toBe(true);

    const lido = await JSZip.loadAsync(buffer);
    const nomes: string[] = [];
    lido.forEach((caminho) => nomes.push(caminho));

    // O zip no disco CARREGA `../x.tex` — e mesmo assim nenhum nome que sai do
    // `forEach` tem um segmento `..`. É exatamente disso que dependemos.
    expect(nomes.some((n) => n.split('/').some((seg) => seg === '..'))).toBe(
      false,
    );
  });
});
