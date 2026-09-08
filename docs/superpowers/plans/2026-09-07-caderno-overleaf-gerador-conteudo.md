# Caderno · Overleaf — Card 02: gerador do `conteudo.tex` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar um simulado populado nos dois arquivos `.tex` que o Overleaf compila, mais a lista de imagens a materializar.

**Architecture:** Quatro arquivos, uma responsabilidade cada. Uma função pura sem I/O no topo (`gerarCaderno`), que orquestra o pipeline de um campo de texto (`texto-para-latex`), que por sua vez delega a parte difícil — decidir o que atravessa sem escape — para `imagens` e para o `escaparForaDaMatematica` do card 01.

**Tech Stack:** TypeScript (CommonJS), Jest 29 + ts-jest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-07-caderno-overleaf-gerador-conteudo-design.md` (commits `d0c1944`, `6ecd3a7`)

---

## Contexto que o plano assume

**Não existe conversor de markdown.** O texto entra no molde literalmente. `**negrito**` sai com os
asteriscos — decisão, não lacuna.

**Três exceções, todas com motivo não estético:**
1. Escape LaTeX (card 01) — `%` é comentário, "100% dos casos" apaga o resto da linha sem erro.
2. Imagem vira `\includegraphics` — literal, a figura não existiria.
3. `<div style="text-align:…">` some — senão vira lixo de HTML impresso.

**Não há distribuição TeX nesta máquina e instalar está fora de escopo.** Nunca tente compilar. Este
card tem gate no Overleaf, mas ele é **manual e do usuário** (Task 8) — pare e espere.

**⚠️ O gabarito nunca entra no `.tex`.** Todas as alternativas são `\choice`. O tipo
`SimuladoParaCaderno` não tem o campo `alternativa`, então é garantia de compilador, não de disciplina.

## Restrições do repo

- ⚠️ **Nunca** rode `yarn lint` nem `npx eslint <diretório>`: reformata arquivos não relacionados.
  Sempre caminhos de arquivo explícitos.
- ⚠️ **Nunca** `git add -A` nem `git add .`. Sempre com caminho.
- Jest: `npx jest --detectOpenHandles --forceExit <caminho>`
- Branch `feature/caderno-02-gerador-conteudo`, já criada. Commits autônomos liberados.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/gerador/tipos.ts` | As interfaces. Nenhuma lógica. |
| `src/modules/caderno/gerador/imagens.ts` | Construtos de imagem → `\includegraphics`. Extensão, esquema, dedup, numeração. |
| `src/modules/caderno/gerador/texto-para-latex.ts` | Um campo de texto → LaTeX. Orquestra div-strip, segmentação e escape. |
| `src/modules/caderno/gerador/gerar-caderno.ts` | Seleção, ordem, blocos de questão, `metadados.tex`, avisos. |

Cada um com seu `.spec.ts` ao lado.

---

### Task 1: Os tipos

**Files:**
- Create: `src/modules/caderno/gerador/tipos.ts`

Sem teste próprio: é só declaração, e os testes das tasks seguintes exercitam tudo. A única asserção
que vale — que `alternativa` **não** existe — é escrita na Task 6, onde há saída para inspecionar.

- [ ] **Step 1: Escrever o arquivo**

```ts
import { Status } from '../../questao/enums/status.enum';

/**
 * Uma imagem a materializar no zip, com a origem preservada.
 *
 * ⚠️ O discriminador existe porque **quase 100% do acervo aponta para fora**
 * (`![](https://enem.dev/…png)`), e não para o nosso R2. O gerador é puro e
 * não baixa nada: ele só diz de onde cada imagem vem, e o card 03 materializa
 * as duas origens no mesmo `assets/NN.ext`.
 *
 * O card 08 ataca a causa — repatriar o acervo para o nosso bucket — e a
 * métrica de sucesso dele é este tipo: zero `origem: 'url'`.
 */
export type ImagemRef =
  | { origem: 'r2'; key: string; arquivo: string }
  | { origem: 'url'; url: string; arquivo: string };

export interface CadernoGerado {
  /** o conteudo.tex inteiro, incluindo o bloco de avisos no topo */
  conteudo: string;
  /** o metadados.tex inteiro */
  metadados: string;
  imagens: ImagemRef[];
  avisos: string[];
  /** números efetivamente impressos */
  questoesIncluidas: number[];
  /** só no modo rascunho; [] no normal */
  questoesFaltantes: number[];
}

/**
 * A questão na forma mínima que o caderno exige.
 *
 * ⚠️ **`alternativa` não está aqui, e é de propósito.** `\CorrectChoice`
 * renderiza idêntico a `\choice` sem a opção `answers` da documentclass —
 * então o gabarito não apareceria no PDF, mas estaria em texto claro dentro do
 * `conteudo.tex`, que a pessoa sobe num projeto do Overleaf, e projeto do
 * Overleaf se compartilha por link. O vazamento seria invisível justamente
 * porque o PDF fica igual.
 *
 * Manter o campo fora do tipo faz o compilador garantir isso, em vez de
 * depender de alguém lembrar. A aplicação é a fonte da verdade do gabarito.
 *
 * ⚠️ `imageId` e `imageAlternativaA..E` também ficam de fora, por decisão do
 * usuário: na prova gerada entram só enunciado, pergunta e alternativas em
 * texto — imagem, só a que estiver dentro do texto.
 */
export interface QuestaoParaCaderno {
  status?: Status;
  textoQuestao?: string;
  pergunta?: string;
  textoAlternativaA?: string;
  textoAlternativaB?: string;
  textoAlternativaC?: string;
  textoAlternativaD?: string;
  textoAlternativaE?: string;
}

/**
 * O simulado na forma mínima que o caderno exige — mesmo espírito do
 * `SimuladoBloqueavel` em `simulado/helpers/bloqueado.ts`. Não acoplar o
 * gerador ao schema Mongoose inteiro.
 */
export interface SimuladoParaCaderno {
  nome: string;
  categoria: {
    nome: string;
    duracao: number;
    /** `null` em categoria custom, que tem quantidade livre */
    quantidadeTotalQuestao?: number | null;
  };
  questoes: { questao: QuestaoParaCaderno; numero: number | null }[];
}

/** As cinco letras, na ordem em que são impressas. */
export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
```

- [ ] **Step 2: Compilar**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sem erro. Se `Status` não resolver, confira o caminho real com
`ls src/modules/questao/enums/`.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/tipos.ts
npx eslint src/modules/caderno/gerador/tipos.ts
git add src/modules/caderno/gerador/tipos.ts
git commit -m "$(cat <<'EOF'
feat(caderno): tipos do gerador do caderno

ImagemRef tem discriminador r2|url porque quase 100% do acervo aponta pra
fora, nao pro nosso R2. O gerador e puro e nao baixa nada -- so diz de onde
cada imagem vem.

QuestaoParaCaderno NAO tem `alternativa`, de proposito: \CorrectChoice
renderiza igual a \choice sem a opcao answers, entao o gabarito nao
apareceria no PDF mas estaria em texto claro no conteudo.tex que vai pro
Overleaf. Deixar o campo fora do tipo faz o compilador garantir isso.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 2: Imagens — reconhecer, validar, emitir

**Files:**
- Create: `src/modules/caderno/gerador/imagens.spec.ts`
- Create: `src/modules/caderno/gerador/imagens.ts`

Esta é a task densa. O módulo expõe um **acumulador**: o caderno inteiro compartilha um contador e um
mapa de dedup, então ele guarda estado entre chamadas.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/modules/caderno/gerador/imagens.spec.ts`:

```ts
import { ColetorDeImagens, emitirImagem, emitirMarcador } from './imagens';

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
    expect(c.registrar('https://x.com/a.png').arquivo).toBe('assets/01.png');
    expect(c.registrar('https://x.com/b.png').arquivo).toBe('assets/02.png');
    expect(c.registrar('https://x.com/c.png').arquivo).toBe('assets/03.png');
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
    expect(emitirMarcador()).toBe(
      '\n\n\\textbf{[imagem indisponível]}\n\n',
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/imagens.spec.ts
```

Esperado: FAIL — `Cannot find module './imagens'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/gerador/imagens.ts`:

```ts
import { ImagemRef } from './tipos';

/**
 * As imagens de um caderno: reconhecimento, validação, numeração e dedup.
 *
 * O gerador é puro e **não baixa nada**. Este módulo só decide se uma
 * referência é aceitável, dá a ela um nome de arquivo dentro do zip, e guarda
 * de onde ela vem para o card 03 materializar.
 */

/** Esquemas aceitos. Fechado de propósito — ver `registrar`. */
const ESQUEMAS = ['http:', 'https:', 'asset:'];

/**
 * A extensão é o **único byte da referência que chega ao `.tex`**: tudo é
 * renomeado para `assets/NN.<ext>`, e `assets/` e `NN` são gerados por nós.
 *
 * ⚠️ E ela não é sanitizada rio acima: `s3-service.ts:43` monta com
 * `originalname.split('.').pop()?.toLowerCase()`, sem filtro. Um arquivo
 * chamado `mapa.p}ng` produz key terminada em `}`, que fecha o grupo do
 * `\includegraphics` cedo e derrama o resto do documento como LaTeX solto.
 */
const EXTENSAO_VALIDA = /^[A-Za-z0-9]{1,5}$/;

/** Por que uma referência foi recusada. Vira aviso e marcador visível. */
export interface ImagemRecusada {
  motivo: string;
}

/** Onde a imagem aceita mora dentro do zip. */
export interface ImagemAceita {
  arquivo: string;
}

/**
 * Extrai a extensão de uma referência, descartando query e fragmento.
 *
 * Feito na mão em vez de `new URL()` porque `asset://assets/x.png` não tem
 * host e o parser trata o caminho de forma inconsistente entre runtimes.
 */
function extensaoDe(referencia: string): string | null {
  const semQuery = referencia.split(/[?#]/)[0];
  const ultimoSegmento = semQuery.split('/').pop() ?? '';
  const ponto = ultimoSegmento.lastIndexOf('.');
  if (ponto === -1) return null;
  const ext = ultimoSegmento.slice(ponto + 1);
  return EXTENSAO_VALIDA.test(ext) ? ext : null;
}

export class ColetorDeImagens {
  private readonly refs: ImagemRef[] = [];
  private readonly porIdentidade = new Map<string, ImagemAceita>();

  /** As imagens aceitas, na ordem de aparição, já deduplicadas. */
  get imagens(): readonly ImagemRef[] {
    return this.refs;
  }

  /**
   * Registra uma referência e devolve onde ela mora no zip, ou o motivo da
   * recusa.
   *
   * ⚠️ A lista de esquemas é fechada porque o card 03 vai fazer **requisição
   * de saída** para esta URL, vinda do texto de uma questão.
   * `![](http://169.254.169.254/latest/meta-data/)` é o desenho clássico de
   * SSRF. O gerador é quem decide o que entra em `imagens[]`, então é aqui que
   * a classe se fecha — o card 03 herda a lista já filtrada.
   */
  registrar(referencia: string): ImagemAceita | ImagemRecusada {
    const esquema = ESQUEMAS.find((e) => referencia.startsWith(e));
    if (!esquema) return { motivo: 'esquema não aceito' };

    const ext = extensaoDe(referencia);
    if (!ext) return { motivo: 'extensão inválida' };

    // A identidade inclui o esquema: uma URL e uma key podem terminar igual
    // sem serem a mesma imagem.
    const identidade = referencia.split(/[?#]/)[0];
    const jaVisto = this.porIdentidade.get(identidade);
    if (jaVisto) return jaVisto;

    const arquivo = `assets/${String(this.refs.length + 1).padStart(2, '0')}.${ext}`;
    const aceita: ImagemAceita = { arquivo };

    this.refs.push(
      esquema === 'asset:'
        ? { origem: 'r2', key: referencia.slice('asset://'.length), arquivo }
        : { origem: 'url', url: referencia, arquivo },
    );
    this.porIdentidade.set(identidade, aceita);
    return aceita;
  }
}

/**
 * O `\includegraphics`, **sempre como parágrafo próprio**.
 *
 * ⚠️ No acervo a imagem vem colada no texto (`![](…png)Os moradores de
 * Andalsnes…`). Deixada inline, o LaTeX mete a figura dentro da linha e a
 * linha fica da altura dela numa coluna de 8 cm. Figura de prova é bloco.
 *
 * `max width` é do `adjustbox` (carregado `[export]` no preambulo.tex): ele
 * encolhe, nunca amplia. Vem **depois** do `width` para que uma conversão
 * errada de px encolha, em vez de estourar a coluna.
 */
export function emitirImagem(arquivo: string, larguraPx?: number): string {
  // CSS define 1px = 1/96 in; 1pt = 1/72 in. Daí 0,75.
  const opcoes = larguraPx
    ? `width=${Math.round(larguraPx * 0.75)}pt,max width=\\linewidth`
    : 'max width=\\linewidth';
  return `\n\n\\includegraphics[${opcoes}]{${arquivo}}\n\n`;
}

/** O que sai no lugar de uma imagem recusada: visível, nunca silêncio. */
export function emitirMarcador(): string {
  return '\n\n\\textbf{[imagem indisponível]}\n\n';
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/imagens.spec.ts
```

Esperado: PASS, 12 testes.

- [ ] **Step 5: Provar que as duas validações mordem**

Remova uma de cada vez, rode, confirme vermelho, restaure, confirme verde. Cole as duas saídas.

| Remover | Teste que precisa ficar vermelho |
|---|---|
| `if (!esquema) return …` | `recusa esquema fora de http, https e asset` |
| `if (!ext) return …` (ou o `EXTENSAO_VALIDA.test`) | `recusa extensão que quebraria o grupo` |

Se alguma remoção não deixar nada vermelho, **reporte** em vez de ajustar o teste.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/imagens.ts src/modules/caderno/gerador/imagens.spec.ts
npx eslint src/modules/caderno/gerador/imagens.ts src/modules/caderno/gerador/imagens.spec.ts
git add src/modules/caderno/gerador/imagens.ts src/modules/caderno/gerador/imagens.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): coletor de imagens do caderno

Tudo e renomeado pra assets/NN.<ext>, entao nem a key nem a URL chegam ao
.tex -- a unica superficie de injecao e a extensao, e ela NAO e sanitizada
rio acima (s3-service usa originalname.split('.').pop() sem filtro).
`mapa.p}ng` fecharia o grupo do \includegraphics cedo.

Lista de esquemas fechada em http/https/asset porque o card 03 fara
requisicao de saida a partir de texto de questao.

NN e padStart(2), nao truncado: caderno de 90 questoes passa de 99 imagens.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 3: Um campo de texto vira LaTeX

**Files:**
- Create: `src/modules/caderno/gerador/texto-para-latex.spec.ts`
- Create: `src/modules/caderno/gerador/texto-para-latex.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/modules/caderno/gerador/texto-para-latex.spec.ts`:

```ts
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
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01.png}\n\n',
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
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01.png}\n\nOs moradores de Andalsnes, na Noruega',
    );
  });

  it('asset:// guarda a key com o prefixo', () => {
    const { coletor } = converter(
      '![](asset://assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg)',
    );
    expect(coletor.imagens[0]).toEqual({
      origem: 'r2',
      key: 'assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg',
      arquivo: 'assets/01.jpeg',
    });
  });

  it('img com width converte px para pt', () => {
    const { latex } = converter(
      '<img src="https://x.com/a.png" alt="mapa" width="320" height="200" />',
    );
    expect(latex).toBe(
      '\n\n\\includegraphics[width=240pt,max width=\\linewidth]{assets/01.png}\n\n',
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
    expect(latex).toBe(
      'antes \n\n\\textbf{[imagem indisponível]}\n\n depois',
    );
    expect(avisos).toEqual(['imagem recusada: esquema não aceito']);
    expect(coletor.imagens).toHaveLength(0);
  });

  it('o alt é descartado, inclusive quando tem caractere especial', () => {
    // \includegraphics não tem legenda, e no acervo real o alt vem vazio.
    // Se fosse mantido sem escape, um `%` no alt apagaria a linha.
    const { latex } = converter('![100% do mapa](https://x.com/a.png)');
    expect(latex).not.toContain('100');
    expect(latex).toContain('assets/01.png');
  });

  it('o contador é do coletor, então continua entre campos', () => {
    const coletor = new ColetorDeImagens();
    textoParaLatex('![](https://x.com/a.png)', coletor, () => {});
    const segundo = textoParaLatex(
      '![](https://x.com/b.png)',
      coletor,
      () => {},
    );
    expect(segundo).toContain('assets/02.png');
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
      '\n\n\\includegraphics[max width=\\linewidth]{assets/01.png}\n\n',
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/texto-para-latex.spec.ts
```

Esperado: FAIL — `Cannot find module './texto-para-latex'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/gerador/texto-para-latex.ts`:

```ts
import { escaparForaDaMatematica } from '../latex/escapar-fora-da-matematica';
import {
  ColetorDeImagens,
  emitirImagem,
  emitirMarcador,
} from './imagens';

/**
 * Um campo de texto de questão vira LaTeX.
 *
 * ```
 * texto cru
 *   → remove <div style="text-align:…">…</div>, mantendo o conteúdo
 *   → segmenta nos construtos de imagem
 *         imagem  →  \includegraphics[…]{assets/NN.ext}   (não escapa)
 *         texto   →  escaparForaDaMatematica(…)           (card 01)
 *   → junta
 * ```
 *
 * ⚠️ **A ordem não é arbitrária.** Escapar primeiro destrói `<img src="…">`:
 * `<`, `>` e `"` estão todos no mapa do `escapeLatex`. Substituir primeiro
 * insere `\includegraphics{…}`, cujos `\ { }` o escaper destruiria em seguida.
 * É o mesmo problema que o card 01 resolveu para matemática, e por isso a
 * mesma forma: segmentar, e delegar o resto.
 *
 * Parágrafos não precisam de tratamento: linha em branco no markdown já é
 * quebra de parágrafo em LaTeX, e `\n` simples já é espaço.
 */

/**
 * O par que o editor grava ao alinhar (`useRichTextEditor.ts:156-163`), sempre
 * no mesmo "part" e **nunca aninhado** — por isso o não-guloso casa certo com
 * vários no mesmo campo. `</div>` órfão fica literal, escapado, que é o
 * comportamento certo para HTML que não veio do nosso editor.
 */
const DIV_ALINHAMENTO = /<div style="text-align:[^"]*">([\s\S]*?)<\/div>/g;

/** `![alt](referencia)` — o construto sem dimensão. */
const IMG_MARKDOWN = /!\[[^\]]*\]\(([^)\s]+)\)/g;

/** `<img src="…" … />` — o construto com dimensão. */
const IMG_HTML = /<img\b[^>]*\/?>/g;
const SRC = /\bsrc="([^"]*)"/;
const WIDTH = /\bwidth="(\d+(?:\.\d+)?)"/;

export function textoParaLatex(
  texto: string | undefined,
  coletor: ColetorDeImagens,
  avisar: (mensagem: string) => void,
): string {
  if (!texto) return '';

  const semDiv = texto.replace(DIV_ALINHAMENTO, '$1');

  const saida: string[] = [];
  let ultimoFim = 0;

  const despejarTexto = (ate: number): void => {
    const trecho = semDiv.slice(ultimoFim, ate);
    if (trecho) saida.push(escaparForaDaMatematica(trecho));
  };

  for (const { inicio, fim, referencia, largura } of acharImagens(semDiv)) {
    despejarTexto(inicio);

    const resultado = coletor.registrar(referencia);
    if ('motivo' in resultado) {
      avisar(`imagem recusada: ${resultado.motivo}`);
      saida.push(emitirMarcador());
    } else {
      saida.push(emitirImagem(resultado.arquivo, largura));
    }

    ultimoFim = fim;
  }

  despejarTexto(semDiv.length);
  return saida.join('');
}

interface OcorrenciaDeImagem {
  inicio: number;
  fim: number;
  referencia: string;
  largura?: number;
}

/**
 * Acha os dois construtos numa passada só, em ordem de posição.
 *
 * Os dois são varridos separadamente e depois ordenados porque uma regex única
 * com alternância ficaria ilegível e os grupos de captura se embaralhariam
 * entre os ramos.
 */
function acharImagens(texto: string): OcorrenciaDeImagem[] {
  const achados: OcorrenciaDeImagem[] = [];

  for (const m of texto.matchAll(IMG_MARKDOWN)) {
    achados.push({
      inicio: m.index,
      fim: m.index + m[0].length,
      referencia: m[1],
    });
  }

  for (const m of texto.matchAll(IMG_HTML)) {
    const src = SRC.exec(m[0]);
    if (!src) continue;
    const width = WIDTH.exec(m[0]);
    achados.push({
      inicio: m.index,
      fim: m.index + m[0].length,
      referencia: src[1],
      largura: width ? Number(width[1]) : undefined,
    });
  }

  return achados.sort((a, b) => a.inicio - b.inicio);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/texto-para-latex.spec.ts
```

Esperado: PASS, 15 testes.

- [ ] **Step 5: Provar que a ordem do pipeline importa**

Este é o passo que protege a decisão central do card. Duas mutações, cada uma com saída colada no
relatório:

1. **Escapar antes de segmentar.** Troque o corpo por
   `escaparForaDaMatematica` aplicado ao texto inteiro primeiro. O teste
   `img com width converte px para pt` precisa ficar vermelho — o `<img>` sai mutilado em
   `\textless{}img …`. Restaure.
2. **Escapar a saída da imagem.** Envolva o `emitirImagem(...)` num `escapeLatex`. Vários testes de
   imagem precisam ficar vermelhos, com `\textbackslash{}includegraphics`. Restaure.

⚠️ Use `WIDTH` com aspas: um atributo sem aspas (`width=320`) não é gerado pelo nosso editor, e
inventar suporte para ele seria escopo extra. Se um teste seu precisar disso, **pergunte** antes.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/texto-para-latex.ts src/modules/caderno/gerador/texto-para-latex.spec.ts
npx eslint src/modules/caderno/gerador/texto-para-latex.ts src/modules/caderno/gerador/texto-para-latex.spec.ts
git add src/modules/caderno/gerador/texto-para-latex.ts src/modules/caderno/gerador/texto-para-latex.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): um campo de texto vira LaTeX

Segmenta nos construtos de imagem e escapa so o resto, delegando as
formulas pro card 01. A ordem nao e arbitraria: escapar primeiro destroi
<img src="..."> (<, > e " estao no mapa), e substituir primeiro insere
\includegraphics{...} cujos \ { } o escaper destruiria depois. Mesmo
problema que o card 01 resolveu pra matematica, mesma forma.

O <div> de alinhamento sai por regex nao-gulosa; </div> orfao fica
literal, porque HTML que nao veio do nosso editor deve aparecer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 4: Seleção, ordem e o bloco da questão

**Files:**
- Create: `src/modules/caderno/gerador/gerar-caderno.spec.ts`
- Create: `src/modules/caderno/gerador/gerar-caderno.ts`

Esta task entrega `gerarCaderno` já funcionando para o `conteudo.tex`. O `metadados.tex` e o bloco de
avisos entram na Task 5, para o teste de cada um ficar legível.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/modules/caderno/gerador/gerar-caderno.spec.ts`:

```ts
import { Status } from '../../questao/enums/status.enum';
import { gerarCaderno, umaLinhaSo } from './gerar-caderno';
import { QuestaoParaCaderno, SimuladoParaCaderno } from './tipos';

const questao = (over: Partial<QuestaoParaCaderno> = {}): QuestaoParaCaderno => ({
  status: Status.Approved,
  textoQuestao: 'Enunciado.',
  pergunta: 'Qual a resposta?',
  textoAlternativaA: 'alfa',
  textoAlternativaB: 'beta',
  textoAlternativaC: 'gama',
  textoAlternativaD: 'delta',
  textoAlternativaE: 'épsilon',
  ...over,
});

const simulado = (
  questoes: { questao: QuestaoParaCaderno; numero: number | null }[],
  over: Partial<SimuladoParaCaderno> = {},
): SimuladoParaCaderno => ({
  nome: 'Simulado de Teste',
  categoria: { nome: 'ENEM 1º dia', duracao: 300, quantidadeTotalQuestao: 5 },
  questoes,
  ...over,
});

describe('gerarCaderno — numeração', () => {
  it('imprime o número do relacionamento, não a posição', () => {
    // Os blocos 46..90 do ENEM precisam casar com o cartão-resposta. Renumerar
    // para 1..5 quebraria a correção.
    const r = gerarCaderno(
      simulado([46, 47, 48, 49, 50].map((numero) => ({ questao: questao(), numero }))),
      { draft: false },
    );
    expect(r.conteudo).toContain('\\setcounter{question}{45}');
    expect(r.conteudo).toContain('\\setcounter{question}{49}');
    expect(r.conteudo).not.toContain('\\setcounter{question}{0}');
    expect(r.questoesIncluidas).toEqual([46, 47, 48, 49, 50]);
  });

  it('emite um setcounter por questão, não só no primeiro', () => {
    // É o que faz um buraco de numeração não desalinhar todas as seguintes.
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 46 }, { questao: questao(), numero: 51 }]),
      { draft: false },
    );
    expect(r.conteudo.match(/\\setcounter\{question\}/g)).toHaveLength(2);
    expect(r.conteudo).toContain('\\setcounter{question}{50}');
  });

  it('reordena em vez de confiar na ordem de entrada', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: 'terceira' }), numero: 3 },
        { questao: questao({ textoQuestao: 'primeira' }), numero: 1 },
        { questao: questao({ textoQuestao: 'segunda' }), numero: 2 },
      ]),
      { draft: false },
    );
    expect(r.conteudo.indexOf('primeira')).toBeLessThan(r.conteudo.indexOf('segunda'));
    expect(r.conteudo.indexOf('segunda')).toBeLessThan(r.conteudo.indexOf('terceira'));
  });

  it('gera cinco blocos para cinco questões', () => {
    const r = gerarCaderno(
      simulado([1, 2, 3, 4, 5].map((numero) => ({ questao: questao(), numero }))),
      { draft: false },
    );
    expect(r.conteudo.match(/\\question/g)).toHaveLength(5);
    expect(r.conteudo.match(/\\begin\{choices\}/g)).toHaveLength(5);
  });
});

describe('gerarCaderno — o gabarito não viaja', () => {
  it('nunca emite CorrectChoice', () => {
    // \CorrectChoice renderiza IDÊNTICO a \choice sem a opção `answers`, então
    // o gabarito não apareceria no PDF — mas estaria em texto claro no
    // conteudo.tex, que vai para um projeto do Overleaf compartilhável por
    // link. O vazamento seria invisível justamente porque o PDF fica igual.
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }]),
      { draft: false },
    );
    expect(r.conteudo).not.toContain('CorrectChoice');
    expect(r.conteudo.match(/\\choice/g)).toHaveLength(5);
  });
});

describe('gerarCaderno — o ambiente questions', () => {
  it('não abre nem fecha questions: quem faz isso é o main.tex', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }]),
      { draft: false },
    );
    expect(r.conteudo).not.toContain('\\begin{questions}');
    expect(r.conteudo).not.toContain('\\end{questions}');
  });
});

describe('gerarCaderno — modo rascunho', () => {
  it('deixa de fora questão pendente e questão sem número', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: 'aprovada' }), numero: 1 },
        { questao: questao({ status: Status.Pending, textoQuestao: 'pendente' }), numero: 2 },
        { questao: questao({ textoQuestao: 'sem numero' }), numero: null },
      ]),
      { draft: true },
    );
    expect(r.conteudo).toContain('aprovada');
    expect(r.conteudo).not.toContain('pendente');
    expect(r.conteudo).not.toContain('sem numero');
    expect(r.questoesIncluidas).toEqual([1]);
  });

  it('lista as faltantes até a quantidade da categoria', () => {
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 1 },
          { questao: questao(), numero: 3 },
        ],
        { categoria: { nome: 'c', duracao: 60, quantidadeTotalQuestao: 5 } },
      ),
      { draft: true },
    );
    expect(r.questoesFaltantes).toEqual([2, 4, 5]);
  });

  it('a faixa das faltantes não começa em 1 quando o bloco é 46..90', () => {
    // Simulado do 2º dia do ENEM. Varrer 1..quantidadeTotalQuestao reportaria
    // 1..45 como pendentes — todas erradas — e a caixa de pendências do
    // rascunho viraria ruído.
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 46 },
          { questao: questao({ status: Status.Pending }), numero: 47 },
          { questao: questao(), numero: 48 },
        ],
        { categoria: { nome: 'ENEM 2º dia', duracao: 300, quantidadeTotalQuestao: 3 } },
      ),
      { draft: true },
    );
    expect(r.questoesIncluidas).toEqual([46, 48]);
    expect(r.questoesFaltantes).toEqual([47]);
  });

  it('categoria custom, de quantidade livre, não tem faltantes', () => {
    // `quantidadeTotalQuestao: null` é categoria custom (etapa 3). Ver
    // `atingiuQuantidade` em simulado/helpers/bloqueado.ts.
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }], {
        categoria: { nome: 'c', duracao: 60, quantidadeTotalQuestao: null },
      }),
      { draft: true },
    );
    expect(r.questoesFaltantes).toEqual([]);
  });

  it('questão sem número fica de fora do modo normal, mas com aviso', () => {
    // `todasNumeradas` (simulado/helpers/bloqueado.ts) impede um simulado
    // assim de ser liberado, então chegar aqui é anomalia. Ela some da prova
    // de um jeito ou de outro — sumir CALADA é o que não pode.
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: 'numerada' }), numero: 1 },
        { questao: questao({ textoQuestao: 'sem numero' }), numero: null },
      ]),
      { draft: false },
    );
    expect(r.conteudo).not.toContain('sem numero');
    expect(r.avisos).toContain('uma questão sem número ficou de fora');
  });

  it('no modo normal não filtra nem lista faltantes', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ status: Status.Pending, textoQuestao: 'pendente' }), numero: 1 },
      ]),
      { draft: false },
    );
    expect(r.conteudo).toContain('pendente');
    expect(r.questoesFaltantes).toEqual([]);
  });
});

describe('gerarCaderno — simulado sem questão elegível', () => {
  it('emite questão-marcador em vez de um questions vazio', () => {
    // `\begin{questions}\end{questions}` sem nenhum \question dispara
    // "Something's wrong--perhaps a missing \item" e a compilação PARA. Um zip
    // que não compila é o pior desfecho: a pessoa não recebe nada que dê para
    // consertar.
    const r = gerarCaderno(simulado([]), { draft: false });
    expect(r.conteudo).toContain('\\question');
    expect(r.conteudo).toContain('nenhuma questão elegível');
    expect(r.questoesIncluidas).toEqual([]);
    expect(r.avisos).toContain(
      'este simulado não tem nenhuma questão elegível para o caderno',
    );
  });

  it('também quando o rascunho filtra tudo', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ status: Status.Pending }), numero: 1 }]),
      { draft: true },
    );
    expect(r.conteudo).toContain('\\question');
    expect(r.conteudo).toContain('nenhuma questão elegível');
  });
});

describe('gerarCaderno — degradação', () => {
  it('alternativa vazia sai vazia e avisa', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ textoAlternativaC: '' }), numero: 47 }]),
      { draft: false },
    );
    expect(r.conteudo).toContain('\\choice{}');
    expect(r.avisos).toContain('questão 47 — alternativa C está em branco');
  });

  it('questão inteira vazia não quebra', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: {
            status: Status.Approved,
            textoQuestao: '',
            pergunta: '',
            textoAlternativaA: '',
            textoAlternativaB: '',
            textoAlternativaC: '',
            textoAlternativaD: '',
            textoAlternativaE: '',
          },
          numero: 12,
        },
      ]),
      { draft: false },
    );
    expect(r.conteudo).toContain('\\question');
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('markdown no campo sai literal, e isso é a premissa', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ textoQuestao: 'veja **isto** e 100% disso' }), numero: 1 }]),
      { draft: false },
    );
    expect(r.conteudo).toContain('veja **isto** e 100\\% disso');
  });
});

describe('gerarCaderno — imagens', () => {
  it('coleta de todos os campos, com contador contínuo', () => {
    const r = gerarCaderno(
      simulado([
        {
          questao: questao({
            textoQuestao: '![](https://x.com/a.png)',
            textoAlternativaB: '![](asset://assets/b.jpeg)',
          }),
          numero: 1,
        },
      ]),
      { draft: false },
    );
    expect(r.imagens).toHaveLength(2);
    expect(r.imagens[0].arquivo).toBe('assets/01.png');
    expect(r.imagens[1].arquivo).toBe('assets/02.jpeg');
  });

  it('mesma imagem em duas questões vira um arquivo só', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoQuestao: '![](https://x.com/a.png)' }), numero: 1 },
        { questao: questao({ textoQuestao: '![](https://x.com/a.png)' }), numero: 2 },
      ]),
      { draft: false },
    );
    expect(r.imagens).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/gerar-caderno.spec.ts
```

Esperado: FAIL — `Cannot find module './gerar-caderno'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/gerador/gerar-caderno.ts`. Nesta task, `metadados` pode voltar como `''` e
o bloco de avisos ainda não é prefixado — a Task 5 fecha os dois.

```ts
import { Status } from '../../questao/enums/status.enum';
import { ColetorDeImagens } from './imagens';
import { textoParaLatex } from './texto-para-latex';
import {
  CadernoGerado,
  LETRAS,
  QuestaoParaCaderno,
  SimuladoParaCaderno,
} from './tipos';

/**
 * Um simulado populado vira os dois arquivos `.tex` do caderno.
 *
 * **Função pura, sem I/O**: não busca no Mongo, não lê o R2, não baixa URL,
 * não escreve arquivo. É o que a torna testável sem infraestrutura, e é também
 * o que a impede de fazer requisição de saída a partir de texto que veio de
 * uma questão.
 *
 * Nada lança. Um caderno com uma questão degradada é recuperável; um caderno
 * que não gera, não.
 */

/**
 * Quanto espaço vertical exigir antes de começar uma questão, para o cabeçalho
 * não ficar órfão no pé da coluna. Do pacote `needspace`, carregado no
 * preambulo.tex.
 */
const ESPACO_MINIMO = '\\needspace{10\\baselineskip}';

export function gerarCaderno(
  simulado: SimuladoParaCaderno,
  opts: { draft: boolean },
): CadernoGerado {
  const avisos: string[] = [];
  const coletor = new ColetorDeImagens();

  const selecionadas = selecionar(simulado, opts.draft, avisos);
  const questoesIncluidas = selecionadas.map(({ numero }) => numero);

  const blocos = selecionadas.length
    ? selecionadas.map(({ questao, numero }) =>
        blocoDaQuestao(questao, numero, coletor, avisos),
      )
    : [blocoMarcadorDeVazio(avisos)];

  return {
    conteudo: blocos.join('\n'),
    metadados: '',
    imagens: [...coletor.imagens],
    avisos,
    questoesIncluidas,
    questoesFaltantes: opts.draft
      ? faltantes(simulado, questoesIncluidas)
      : [],
  };
}

/**
 * ⚠️ Reordena sempre, em vez de confiar que o array já veio ordenado.
 *
 * No modo rascunho, filtra o que ainda não pode ser impresso. No normal, tudo
 * entra: o gate de "este simulado pode ser gerado?" é do card 04, não daqui.
 */
function selecionar(
  simulado: SimuladoParaCaderno,
  draft: boolean,
  avisos: string[],
): { questao: QuestaoParaCaderno; numero: number }[] {
  return simulado.questoes
    .filter((q): q is { questao: QuestaoParaCaderno; numero: number } => {
      if (q.numero == null) {
        // No rascunho, questão sem número é esperado e silencioso. No modo
        // normal é anomalia: `todasNumeradas` (simulado/helpers/bloqueado.ts)
        // impede um simulado assim de ser liberado, então chegar aqui quer
        // dizer que algo destravou. Some da prova de um jeito ou de outro — mas
        // sumir CALADO é o que não pode.
        if (!draft) avisos.push('uma questão sem número ficou de fora');
        return false;
      }
      return draft ? q.questao.status === Status.Approved : true;
    })
    .sort((a, b) => a.numero - b.numero);
}

/**
 * Os números que faltam para o caderno ficar completo.
 *
 * ⚠️ **A faixa não começa em 1.** Um simulado do 2º dia do ENEM é numerado
 * 46..90, e varrer `1..quantidadeTotalQuestao` reportaria 1..45 como
 * pendentes — todas erradas, e a caixa de pendências do rascunho viraria
 * ruído. A base sai do menor número que existe no simulado, contando também
 * as questões que o filtro do rascunho deixou de fora.
 */
function faltantes(
  simulado: SimuladoParaCaderno,
  incluidas: number[],
): number[] {
  const alvo = simulado.categoria.quantidadeTotalQuestao;
  // `null` é categoria custom, de quantidade livre (etapa 3) — ver
  // `atingiuQuantidade` em simulado/helpers/bloqueado.ts. Sem alvo, não há o
  // que faltar.
  if (alvo == null) return [];

  const numerados = simulado.questoes
    .map((q) => q.numero)
    .filter((n): n is number => n != null);
  const base = numerados.length ? Math.min(...numerados) : 1;

  const presentes = new Set(incluidas);
  const saida: number[] = [];
  for (let n = base; n < base + alvo; n += 1) {
    if (!presentes.has(n)) saida.push(n);
  }
  return saida;
}

function blocoDaQuestao(
  questao: QuestaoParaCaderno,
  numero: number,
  coletor: ColetorDeImagens,
  avisos: string[],
): string {
  const converter = (texto: string | undefined): string =>
    textoParaLatex(texto, coletor, (m) => avisos.push(`questão ${numero} — ${m}`));

  const enunciado = converter(questao.textoQuestao);
  const pergunta = converter(questao.pergunta);

  const alternativas = LETRAS.map((letra) => {
    const bruto = questao[`textoAlternativa${letra}` as const];
    if (!bruto) {
      avisos.push(`questão ${numero} — alternativa ${letra} está em branco`);
      return '  \\choice{}';
    }
    return `  \\choice ${converter(bruto)}`;
  });

  return [
    ESPACO_MINIMO,
    // ⚠️ O exam.cls incrementa ANTES de imprimir: para sair "QUESTÃO 48", o
    // contador vai a 47. E é um por questão, não só no primeiro, para que um
    // buraco de numeração não desalinhe todas as seguintes.
    `\\setcounter{question}{${numero - 1}}`,
    `\\question ${enunciado}`,
    '',
    pergunta,
    '\\begin{choices}',
    ...alternativas,
    '\\end{choices}',
    '',
  ].join('\n');
}

/**
 * ⚠️ `questions` no exam.cls é ambiente de lista.
 * `\begin{questions}\end{questions}` sem nenhum `\question` dentro dispara
 * "Something's wrong--perhaps a missing \item" e a compilação **para**.
 *
 * É alcançável: no modo rascunho o filtro pode zerar. E um zip que não compila
 * é o pior desfecho desta POC — pior que prova feia, porque a pessoa não
 * recebe nada que dê para consertar.
 */
function blocoMarcadorDeVazio(avisos: string[]): string {
  avisos.push('este simulado não tem nenhuma questão elegível para o caderno');
  return [
    '\\setcounter{question}{0}',
    '\\question \\textbf{[Este simulado não tem nenhuma questão elegível para o caderno.]}',
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/gerar-caderno.spec.ts
```

Esperado: PASS, 19 testes.

- [ ] **Step 5: Provar que três decisões mordem**

Uma de cada vez, restaurando entre elas. Cole as três saídas vermelhas.

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| `\setcounter` só antes do primeiro bloco | `emite um setcounter por questão` |
| tirar o `.sort(...)` de `selecionar` | `reordena em vez de confiar na ordem de entrada` |
| `blocos` vazio em vez do marcador | `emite questão-marcador em vez de um questions vazio` |
| `base` fixo em `1` dentro de `faltantes` | `a faixa das faltantes não começa em 1` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/gerar-caderno.ts src/modules/caderno/gerador/gerar-caderno.spec.ts
npx eslint src/modules/caderno/gerador/gerar-caderno.ts src/modules/caderno/gerador/gerar-caderno.spec.ts
git add src/modules/caderno/gerador/gerar-caderno.ts src/modules/caderno/gerador/gerar-caderno.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): selecao, ordem e bloco da questao

Numero vem do relacionamento e nunca e renumerado: os blocos 46..90 do
ENEM precisam casar com o cartao-resposta. Um \setcounter por questao,
nao so no primeiro, pra buraco de numeracao nao desalinhar o resto.

Simulado sem questao elegivel emite questao-marcador: \begin{questions}
vazio dispara "perhaps a missing \item" e a compilacao PARA. Zip que nao
compila e o pior desfecho -- a pessoa nao recebe nada consertavel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 5: `metadados.tex` e o bloco de avisos

**Files:**
- Modify: `src/modules/caderno/gerador/gerar-caderno.ts`
- Modify: `src/modules/caderno/gerador/gerar-caderno.spec.ts`

- [ ] **Step 1: Acrescentar os testes que falham**

Adicionar ao fim de `gerar-caderno.spec.ts`:

```ts
describe('gerarCaderno — metadados.tex', () => {
  it('escapa o nome do simulado', () => {
    // "Simulado 100% ENEM" sem escape apaga o resto da linha, e o título da
    // capa some sem nenhum erro de compilação.
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }], { nome: 'Simulado 100% ENEM' }),
      { draft: false },
    );
    expect(r.metadados).toContain('\\def\\cadernoTitulo{Simulado 100\\% ENEM}');
  });

  it('monta o subtítulo com categoria, contagem e duração', () => {
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 1 },
          { questao: questao(), numero: 2 },
        ],
        { categoria: { nome: 'ENEM 1º dia', duracao: 300, quantidadeTotalQuestao: 2 } },
      ),
      { draft: false },
    );
    // O separador é $\cdot$, não o `·` literal: o glifo depende do T1.
    expect(r.metadados).toContain(
      '\\def\\cadernoSubtitulo{ENEM 1º dia $\\cdot$ 2 questões $\\cdot$ 300 min}',
    );
  });

  it('escapa o nome da categoria também', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao(), numero: 1 }], {
        categoria: { nome: 'Exatas & Naturais', duracao: 60, quantidadeTotalQuestao: 1 },
      }),
      { draft: false },
    );
    expect(r.metadados).toContain('Exatas \\& Naturais');
  });

  it('no modo normal, nada de rascunho', () => {
    const r = gerarCaderno(simulado([{ questao: questao(), numero: 1 }]), {
      draft: false,
    });
    expect(r.metadados).not.toContain('cadernoRascunho');
    expect(r.metadados).not.toContain('cadernoPendencias');
  });

  it('no rascunho, liga o newif e lista as pendências', () => {
    // ⚠️ \cadernoRascunho é um \newif declarado no preambulo.tex, NÃO um \def.
    // `\def\cadernoRascunho{true}` não liga a marca d'água e não dá erro — ela
    // simplesmente não aparece.
    const r = gerarCaderno(
      simulado(
        [
          { questao: questao(), numero: 1 },
          { questao: questao(), numero: 3 },
        ],
        { categoria: { nome: 'c', duracao: 60, quantidadeTotalQuestao: 4 } },
      ),
      { draft: true },
    );
    expect(r.metadados).toContain('\\cadernoRascunhotrue');
    expect(r.metadados).not.toContain('\\def\\cadernoRascunho{');
    expect(r.metadados).toContain('\\def\\cadernoPendencias{2, 4}');
  });
});

describe('gerarCaderno — bloco de avisos', () => {
  it('vai no topo do conteudo.tex, um por linha', () => {
    const r = gerarCaderno(
      simulado([{ questao: questao({ textoAlternativaC: '' }), numero: 47 }]),
      { draft: false },
    );
    expect(r.conteudo.startsWith('% AVISO:')).toBe(true);
    expect(r.conteudo).toContain(
      '% AVISO: questão 47 — alternativa C está em branco',
    );
  });

  it('sem aviso nenhum, não há bloco', () => {
    const r = gerarCaderno(simulado([{ questao: questao(), numero: 1 }]), {
      draft: false,
    });
    expect(r.conteudo).not.toContain('% AVISO:');
  });

  it('uma linha de comentário por aviso, sempre', () => {
    const r = gerarCaderno(
      simulado([
        { questao: questao({ textoAlternativaA: '', textoAlternativaC: '' }), numero: 1 },
      ]),
      { draft: false },
    );
    const linhasDeAviso = r.conteudo
      .split('\n')
      .filter((l) => l.startsWith('% AVISO:'));
    expect(linhasDeAviso).toHaveLength(r.avisos.length);
  });
});

describe('umaLinhaSo', () => {
  // ⚠️ Testado direto, e não através de `gerarCaderno`, porque HOJE nenhum
  // aviso carrega texto de questão — então um teste de ponta a ponta passaria
  // sem exercitar nada, e seria daqueles que dão a impressão de proteger.
  //
  // A proteção é para quando um aviso passar a embutir conteúdo (nome de
  // arquivo, trecho do enunciado). Uma quebra de linha ali ENCERRA o
  // comentário LaTeX e joga o resto do aviso dentro do documento, impresso na
  // prova do aluno.
  it('troca quebra de linha por espaço', () => {
    expect(umaLinhaSo('questão 3 —\nalternativa vazia')).toBe(
      'questão 3 — alternativa vazia',
    );
    expect(umaLinhaSo('a\r\nb')).toBe('a b');
    expect(umaLinhaSo('a\n\n\nb')).toBe('a b');
  });

  it('apara as pontas', () => {
    expect(umaLinhaSo('  texto  ')).toBe('texto');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/gerar-caderno.spec.ts
```

Esperado: FAIL nos novos, PASS nos 16 da Task 4.

- [ ] **Step 3: Implementar**

Em `gerar-caderno.ts`, acrescente o import do escaper do card 01 —

```ts
import { escaparForaDaMatematica } from '../latex/escapar-fora-da-matematica';
```

— e as duas funções:

```ts
/**
 * ⚠️ Quebra de linha dentro de um aviso **encerra o comentário** e joga o resto
 * dentro do documento, impresso na prova.
 */
export const umaLinhaSo = (texto: string): string =>
  texto.replace(/[\r\n]+/g, ' ').trim();

function blocoDeAvisos(avisos: string[]): string {
  if (!avisos.length) return '';
  return `${avisos.map((a) => `% AVISO: ${umaLinhaSo(a)}`).join('\n')}\n\n`;
}

/**
 * ⚠️ São dois arquivos porque o `metadados.tex` é lido **no preâmbulo**, antes
 * do `\begin{document}`, e o `conteudo.tex` dentro do documento. A capa precisa
 * do título antes de as questões serem diagramadas.
 */
function gerarMetadados(
  simulado: SimuladoParaCaderno,
  incluidas: number[],
  faltando: number[],
  draft: boolean,
): string {
  const escapar = (t: string) => escaparForaDaMatematica(t);
  const linhas = [
    '% gerado automaticamente por ms-simulado — não editar',
    `\\def\\cadernoTitulo{${escapar(simulado.nome)}}`,
    // O separador é $\cdot$, não o `·` literal: o glifo depende do T1.
    `\\def\\cadernoSubtitulo{${escapar(simulado.categoria.nome)} $\\cdot$ ${
      incluidas.length
    } questões $\\cdot$ ${simulado.categoria.duracao} min}`,
  ];

  if (draft) {
    // ⚠️ \cadernoRascunho é um \newif declarado no preambulo.tex, NÃO um \def.
    // `\def\cadernoRascunho{true}` não liga a marca d'água e NÃO dá erro — ela
    // simplesmente não aparece.
    linhas.push('\\cadernoRascunhotrue');
    linhas.push(`\\def\\cadernoPendencias{${faltando.join(', ')}}`);
  }

  return `${linhas.join('\n')}\n`;
}
```

E no `gerarCaderno`, troque o `return` por:

```ts
  const questoesFaltantes = opts.draft
    ? faltantes(simulado, questoesIncluidas)
    : [];

  return {
    conteudo: blocoDeAvisos(avisos) + blocos.join('\n'),
    metadados: gerarMetadados(
      simulado,
      questoesIncluidas,
      questoesFaltantes,
      opts.draft,
    ),
    imagens: [...coletor.imagens],
    avisos,
    questoesIncluidas,
    questoesFaltantes,
  };
```

⚠️ O `blocoDeAvisos` é montado **depois** de os blocos rodarem, porque é durante eles que os avisos
aparecem. Se você calcular o bloco antes, ele sai vazio e nenhum teste acusa.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/gerar-caderno.spec.ts
```

Esperado: PASS, 28 testes.

- [ ] **Step 5: Provar que duas decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| `\cadernoRascunhotrue` → `\def\cadernoRascunho{true}` | `no rascunho, liga o newif` |
| tirar o `umaLinhaSo` | `troca quebra de linha por espaço` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/gerar-caderno.ts src/modules/caderno/gerador/gerar-caderno.spec.ts
npx eslint src/modules/caderno/gerador/gerar-caderno.ts src/modules/caderno/gerador/gerar-caderno.spec.ts
git add src/modules/caderno/gerador/gerar-caderno.ts src/modules/caderno/gerador/gerar-caderno.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): metadados.tex e bloco de avisos

\cadernoRascunho e um \newif do preambulo, nao um \def: emitir
\def\cadernoRascunho{true} nao liga a marca d'agua e nao da erro.

Quebra de linha dentro de um aviso ENCERRA o comentario LaTeX e joga o
resto impresso na prova -- dai o achatamento.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 6: Snapshot e a garantia de tipo do gabarito

**Files:**
- Create: `src/modules/caderno/gerador/gerar-caderno.snapshot.spec.ts`

- [ ] **Step 1: Escrever o teste**

```ts
import { Status } from '../../questao/enums/status.enum';
import { gerarCaderno } from './gerar-caderno';
import { QuestaoParaCaderno, SimuladoParaCaderno } from './tipos';

/**
 * Um simulado que exercita, num arquivo só, tudo o que o gerador decide:
 * numeração real do ENEM, imagem externa (o caso dominante do acervo), imagem
 * do nosso R2, largura em px, div de alinhamento, matemática, `%` no texto,
 * markdown que fica literal, alternativa em branco e imagem recusada.
 */
const SIMULADO: SimuladoParaCaderno = {
  nome: 'Simulado 100% ENEM — 1º dia',
  categoria: { nome: 'ENEM 1º dia', duracao: 300, quantidadeTotalQuestao: 3 },
  questoes: [
    {
      numero: 47,
      questao: {
        status: Status.Approved,
        textoQuestao:
          '![](https://enem.dev/2016/questions/3/812288c1-3e37-4369-914a-057525abd52e.png)Os moradores de Andalsnes, na Noruega, poderiam se dar ao luxo de morar perto do trabalho.',
        pergunta: 'O texto trata de:',
        textoAlternativaA: 'Mobilidade urbana',
        textoAlternativaB: 'Arquitetura **modular**',
        textoAlternativaC: 'Turismo de inverno',
        textoAlternativaD: 'Custo de R$ 1.200,00 por mês',
        textoAlternativaE: 'Nenhuma das anteriores',
      },
    },
    {
      numero: 46,
      questao: {
        status: Status.Approved,
        textoQuestao:
          'Considere a função $f(x) = x^2 - 4$, que representa 100% do fenômeno.',
        pergunta: 'As raízes de $f$ são:',
        textoAlternativaA: '$x = 0$ e $x = 4$',
        textoAlternativaB: '$x = -2$ e $x = 2$',
        textoAlternativaC: '',
        textoAlternativaD: '$x \\in \\emptyset$',
        textoAlternativaE: '$x = 1$ e $x = -1$',
      },
    },
    {
      numero: 48,
      questao: {
        status: Status.Approved,
        textoQuestao:
          '<div style="text-align: center"><img src="asset://assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg" alt="" width="320" height="200" /></div>',
        pergunta: 'A imagem mostra:',
        textoAlternativaA: 'Um mapa',
        textoAlternativaB: '![](ftp://arquivo.antigo/grafico.png)',
        textoAlternativaC: 'Uma fotografia',
        textoAlternativaD: 'Um gráfico',
        textoAlternativaE: 'Uma tabela',
      },
    },
  ],
};

describe('gerarCaderno — snapshot', () => {
  it('conteudo.tex do fixture completo', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).conteudo).toMatchSnapshot();
  });

  it('metadados.tex do fixture completo', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).metadados).toMatchSnapshot();
  });

  it('metadados.tex no modo rascunho', () => {
    expect(gerarCaderno(SIMULADO, { draft: true }).metadados).toMatchSnapshot();
  });

  it('as imagens coletadas', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).imagens).toMatchSnapshot();
  });
});

describe('gerarCaderno — o gabarito não existe no tipo', () => {
  it('QuestaoParaCaderno não aceita `alternativa`', () => {
    // Garantia de compilador, não de disciplina: se alguém acrescentar o campo
    // ao tipo, este teste para de compilar, e o motivo está no docblock de
    // QuestaoParaCaderno.
    //
    // ⚠️ Precisa ser um objeto literal ATRIBUÍDO DIRETO ao tipo. TypeScript só
    // reclama de propriedade extra em literal; passando por uma variável
    // intermediária a tipagem estrutural aceita o campo a mais, o
    // @ts-expect-error vira "unused" e o teste falha por outro motivo.
    const q: QuestaoParaCaderno = {
      status: Status.Approved,
      textoQuestao: 'Enunciado.',
      // @ts-expect-error `alternativa` não pertence a QuestaoParaCaderno
      alternativa: 'B',
    };
    expect(q).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar e gerar o snapshot**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/gerar-caderno.snapshot.spec.ts
```

Esperado: PASS, 5 testes, `5 snapshots written`.

- [ ] **Step 3: LER o snapshot e conferir à mão**

Abra `src/modules/caderno/gerador/__snapshots__/gerar-caderno.snapshot.spec.ts.snap`.

**Um snapshot aceito sem leitura não prova nada** — ele apenas congela o que quer que o código faça,
inclusive o errado. Confira, item a item, e reporte qualquer divergência **em vez de** aceitar:

- [ ] a ordem é 46, 47, 48 — a entrada estava fora de ordem
- [ ] os contadores são 45, 46 e 47
- [ ] nenhum `CorrectChoice` em lugar nenhum
- [ ] a imagem da questão 47 está em parágrafo próprio, separada do texto colado nela
- [ ] a imagem da questão 48 tem `width=240pt` e não sobrou nenhum `<div>`
- [ ] a alternativa C da 46 é `\choice{}` e há aviso correspondente
- [ ] a alternativa B da 48 virou `\textbf{[imagem indisponível]}` com aviso
- [ ] `100%` aparece como `100\%` nos dois lugares
- [ ] `**modular**` continua com os asteriscos
- [ ] `$f(x) = x^2 - 4$` está intacto
- [ ] `R$ 1.200,00` virou `R\$ 1.200,00` e não abriu fórmula
- [ ] o bloco `% AVISO:` está no topo, com uma linha por aviso
- [ ] o `.tex` não contém `\begin{questions}`

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/gerar-caderno.snapshot.spec.ts
npx eslint src/modules/caderno/gerador/gerar-caderno.snapshot.spec.ts
git add src/modules/caderno/gerador/gerar-caderno.snapshot.spec.ts src/modules/caderno/gerador/__snapshots__/
git commit -m "$(cat <<'EOF'
test(caderno): snapshot do fixture completo + garantia de tipo do gabarito

O fixture exercita num arquivo so: numeracao real do ENEM fora de ordem,
imagem externa colada no texto (o caso dominante do acervo), imagem do R2
com width, div de alinhamento, matematica, % no texto, markdown literal,
alternativa em branco e imagem recusada.

O @ts-expect-error prova que `alternativa` nao cabe no tipo: se alguem
acrescentar o campo, o teste para de compilar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 7: Pagar a dívida do gabarito no card 00

**Files:**
- Modify: `src/modules/caderno/templates/v1/main.tex`
- Modify: `src/modules/caderno/templates/v1/LEIA-ME.txt`
- Modify: `src/modules/caderno/templates/v1/exemplo/conteudo.tex`
- Modify: `src/modules/caderno/templates.spec.ts`

Dois arquivos que **vão dentro do zip** prometem uma feature que não vai existir. Quem seguir as
instruções recompila, não vê diferença nenhuma, e conclui que o template está quebrado.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/modules/caderno/templates.spec.ts`:

```ts
describe('template não promete o gabarito do professor', () => {
  // O gerador emite só \choice: \CorrectChoice renderiza idêntico sem a opção
  // `answers`, então o gabarito não apareceria no PDF mas estaria em texto
  // claro no conteudo.tex que vai para um projeto compartilhável do Overleaf.
  // Com isso, a opção `answers` não tem o que destacar, e instruir alguém a
  // usá-la manda a pessoa procurar defeito onde não tem.
  const arquivosDoZip = ['main.tex', 'LEIA-ME.txt'];

  it.each(arquivosDoZip)('%s não menciona a opção answers', (arquivo) => {
    const texto = fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');
    expect(texto).not.toContain('answers');
  });

  it.each(arquivosDoZip)('%s não promete gabarito', (arquivo) => {
    const texto = fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');
    expect(texto.toLowerCase()).not.toContain('gabarito');
  });

  it('o exemplo continua usando CorrectChoice, e diz por quê', () => {
    // O fixture é smoke test do template, não amostra da saída do gerador.
    // Prova que o exam.cls faz aquilo, e o cabeçalho registra a diferença.
    const texto = fs.readFileSync(
      path.join(TEMPLATE_DIR, 'exemplo/conteudo.tex'),
      'utf-8',
    );
    expect(texto).toContain('\\CorrectChoice');
    expect(texto).toMatch(/gerador emite (apenas |só )?\\choice/i);
  });
});
```

⚠️ Confira os nomes já usados no topo de `templates.spec.ts` (`fs`, `path`, `TEMPLATE_DIR`) e reaproveite
os imports existentes em vez de duplicá-los.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: FAIL — `main.tex` e `LEIA-ME.txt` contêm ambos os termos; o exemplo não tem a nota.

- [ ] **Step 3: Corrigir os três arquivos**

**`main.tex`** — remova do comentário do topo o parágrafo inteiro:

```
% Gabarito do professor: troque a linha do \documentclass abaixo por
%   \documentclass[11pt,a4paper,twocolumn,answers]{exam}
% e recompile. A alternativa correta sai destacada.
```

e ponha no lugar:

```
% A alternativa correta NÃO viaja neste pacote: todas saem como \choice. A
% aplicação é a fonte da verdade do gabarito. (Um \CorrectChoice renderiza
% idêntico a \choice sem a opção `answers`, então o gabarito não apareceria no
% PDF — mas ficaria legível dentro do conteudo.tex, e este projeto se
% compartilha por link.)
```

**`LEIA-ME.txt`** — troque a seção `GABARITO DO PROFESSOR` inteira por:

```
A RESPOSTA CORRETA NÃO VEM NO PACOTE

  Todas as alternativas saem iguais neste caderno, de propósito. A resposta
  correta fica só na plataforma: um arquivo que se sobe para o Overleaf e se
  compartilha por link não é lugar para gabarito.

  Para conferir as respostas, use a questão na plataforma.
```

**`exemplo/conteudo.tex`** — acrescente ao bloco de comentário do topo:

```
% As alternativas corretas abaixo usam \CorrectChoice para exercitar o
% exam.cls. O gerador emite apenas \choice — o gabarito nunca vai no zip.
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS, incluindo os 13 testes que já existiam.

⚠️ Se algum teste antigo do card 00 quebrar por causa da edição, **reporte antes de ajustá-lo**: pode
ser que ele afirmasse justamente o texto que saiu, e aí a asserção é que precisa mudar — mas quero
saber qual.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/modules/caderno/templates.spec.ts
npx eslint src/modules/caderno/templates.spec.ts
git add src/modules/caderno/templates.spec.ts src/modules/caderno/templates/
git commit -m "$(cat <<'EOF'
fix(caderno): template nao promete mais o gabarito do professor

main.tex e LEIA-ME.txt vao DENTRO do zip e mandavam o professor trocar a
documentclass pra answers. Como o gerador emite so \choice, quem seguir
recompila, nao ve diferenca nenhuma e conclui que o template esta
quebrado.

O exemplo/conteudo.tex mantem \CorrectChoice -- e smoke test do template,
nao amostra da saida -- e agora diz isso no cabecalho.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 8: Montar o pacote para o gate — **PARA e espera o usuário**

**Files:**
- Create: `scripts/caderno-exemplo.ts` (temporário, **não** commitado)

Este card tem gate manual no Overleaf. É o primeiro `conteudo.tex` de verdade, e é onde as decisões de
layout deste plano encontram um compilador pela primeira vez.

- [ ] **Step 1: Gerar os arquivos do fixture**

Exporte o `SIMULADO` da Task 6 (`export const SIMULADO`) e crie `scripts/caderno-exemplo.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { gerarCaderno } from '../src/modules/caderno/gerador/gerar-caderno';
import { SIMULADO } from '../src/modules/caderno/gerador/gerar-caderno.snapshot.spec';
// ⚠️ Importe TEMPLATE_DIR e ARQUIVOS_DO_ZIP — não recalcule o caminho. O card
// 00 os expôs justamente para não haver duas verdades sobre onde o template
// mora.
import {
  ARQUIVOS_DO_ZIP,
  TEMPLATE_DIR,
} from '../src/modules/caderno/templates';

const destino = process.argv[2];
if (!destino) throw new Error('uso: caderno-exemplo.ts <diretório de saída>');

fs.mkdirSync(path.join(destino, 'assets'), { recursive: true });

for (const arquivo of ARQUIVOS_DO_ZIP) {
  fs.copyFileSync(
    path.join(TEMPLATE_DIR, arquivo),
    path.join(destino, arquivo),
  );
}

const caderno = gerarCaderno(SIMULADO, { draft: false });
fs.writeFileSync(path.join(destino, 'conteudo.tex'), caderno.conteudo);
fs.writeFileSync(path.join(destino, 'metadados.tex'), caderno.metadados);

// O gerador não baixa nada (é o card 03). Para o gate compilar, cada imagem
// precisa existir com o nome EXATO que o .tex referencia; o conteúdo não
// importa para testar layout, só a presença e a extensão.
for (const img of caderno.imagens) {
  fs.copyFileSync(
    path.join(TEMPLATE_DIR, 'logo.png'),
    path.join(destino, img.arquivo),
  );
  console.log(`imagem ${img.arquivo} <- ${img.origem}`);
}

console.log(`\n${caderno.avisos.length} aviso(s):`);
caderno.avisos.forEach((a) => console.log(`  - ${a}`));
console.log(`\npronto em ${destino}`);
```

⚠️ O `scripts/` fica **fora** do `src/`. Não o adicione ao `tsconfig.build.json` — `.ts` fora de `src/`
desloca o `rootDir` inferido e move o `dist/main.js`, quebrando o PM2 com "Script not found". O
script é descartável e some no Step 4.

```bash
SAIDA=/private/tmp/claude-501/-Users-fernandoalmeidapinto-Projects-vcnafacul-vcnafacul-3/3b415680-d938-4e69-950e-c9372e5a19f6/scratchpad/caderno-gate
npx ts-node -T --compiler-options '{"module":"commonjs"}' scripts/caderno-exemplo.ts "$SAIDA"
```

- [ ] **Step 2: Conferir a saída do script**

O log precisa listar uma imagem por `ImagemRef` e os avisos esperados (alternativa C em branco na 46,
imagem recusada na 48). Se listar zero imagens, algo no pipeline não coletou — **pare e reporte**.

- [ ] **Step 3: Empacotar**

Zip com raiz plana: `main.tex`, `preambulo.tex`, `logo.png`, `LEIA-ME.txt`, `metadados.tex`,
`conteudo.tex` lado a lado, e `assets/` como única subpasta.

- [ ] **Step 4: Apagar o script e conferir a árvore**

```bash
cd "$SAIDA" && zip -r ../caderno-gate.zip . && cd -
rm -f scripts/caderno-exemplo.ts
git status --porcelain
```

O zip e o diretório de trabalho ficam **fora** do repo (use o scratchpad). `git status` precisa sair
limpo.

- [ ] **Step 5: PARE**

Diga ao usuário onde está o zip e o que olhar:

- numeração **46, 47, 48** — não 1, 2, 3
- a imagem da questão 47 como bloco, separada do texto, dentro da coluna
- a imagem da questão 48 encolhida pela largura, sem `<div>` sobrando
- `100%` impresso, nos dois lugares
- `$f(x) = x^2 - 4$` renderizado como fórmula
- `R$ 1.200,00` como dinheiro, não como fórmula
- alternativa C da 46 em branco, e a B da 48 com `[imagem indisponível]`
- o bloco `% AVISO:` no topo do `conteudo.tex`
- **nenhuma alternativa destacada** — e, compilando com `answers`, nada muda

**Não prossiga sem a resposta.**

---

### Task 9: Fechar

- [ ] **Step 1: Cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='modules/caderno/gerador/**/*.ts' src/modules/caderno
```

Esperado: ≥ 90% em statements. Abaixo disso, acrescente teste — nunca um `istanbul ignore`.

- [ ] **Step 2: Suíte e build**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta
yarn build && ls dist/main.js && rm -rf dist
```

- [ ] **Step 3: Abrir o PR contra a POC**

```bash
git push -u origin feature/caderno-02-gerador-conteudo
gh pr create --base poc/caderno-overleaf --title "[Caderno · Overleaf] Card 02 — gerador do conteudo.tex e metadados.tex"
```

O corpo do PR precisa cobrir: o pipeline e por que a ordem importa; URL externa como caso dominante e
o discriminador em `ImagemRef`; o gabarito fora do tipo; a extensão como única superfície de injeção;
a lista fechada de esquemas e o card 03; o `questions` vazio que não compila; e a dívida paga no card
00.

⚠️ `--base poc/caderno-overleaf`, **não** `develop`.
