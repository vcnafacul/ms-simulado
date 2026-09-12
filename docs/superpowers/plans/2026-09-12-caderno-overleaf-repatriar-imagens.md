# Caderno · Overleaf — Card 08: repatriar imagens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer as 840 imagens hospedadas fora para o nosso R2, reescrevendo as referências nas questões — sem nunca deixar uma questão apontando para uma imagem que não existe.

**Architecture:** Lógica pura e testável em `src/modules/caderno/repatriar/`, CLI fino em `scripts/`. As três fronteiras — busca HTTP, storage e repositório — são injetadas, então nenhum teste toca homologação nem o R2.

**Tech Stack:** TypeScript, Jest, `mongoose` direto no CLI (padrão do `backfill-criador-id`). **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-12-caderno-overleaf-repatriar-imagens-design.md`

---

## Contexto que o plano assume

**Este é o único card da POC que escreve no acervo.** Todos os outros leem. A ordem de escrita é o
coração do trabalho, e está na spec — vale reler antes de começar.

**O acervo, medido em HOMOLOGAÇÃO** (todos os `.env` deste checkout apontam para lá):

| | |
|---|---|
| questões com URL externa | 728 |
| ocorrências | 840 |
| URLs distintas | 818 |
| host | `enem.dev`, 840 de 840 |
| total | ~64 MB |

⚠️ **O filtro do card original migraria zero questões.** Ele filtra por `contentFormat === 'markdown'`,
e nenhuma das 728 é markdown. O critério é o **texto**.

## Restrições do repo

- ⚠️ **Nunca** `yarn lint` nem `npx eslint <diretório>`: reformata arquivos não relacionados. Sempre caminhos explícitos.
- ⚠️ **Nunca** `git add -A` nem `git add .`.
- Jest: `npx jest --detectOpenHandles --forceExit <caminho>`. **`rootDir` do jest é `src`** — por isso a lógica mora lá e só o CLI fica em `scripts/`.
- `scripts/` já está no `exclude` do `tsconfig.build.json`. **Não mexa nisso** — `.ts` fora de `src/` desloca o `rootDir` e move o `dist/main.js`, quebrando o PM2.
- Branch `feature/caderno-08-repatriar-imagens`, já criada. Commits autônomos liberados.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/gerador/texto-para-latex.ts` | **modificado**: exporta `acharImagens` |
| `src/modules/caderno/repatriar/tipos.ts` | `LinhaDeReversao`, `Falha`, `ResultadoDaRepatriacao`, `CAMPOS_DE_TEXTO` |
| `src/modules/caderno/repatriar/reescrever-texto.ts` | troca uma URL por `asset://` num texto. Puro. |
| `src/modules/caderno/repatriar/repatriador.ts` | a ordem de escrita, com as três fronteiras injetadas |
| `scripts/repatriar-imagens.ts` | CLI: flags, conexão, relatório |
| `package.json` | **modificado**: `repatriar:imagens` |

---

### Task 1: Reescrita de texto, e uma fonte só para "o que é uma imagem"

**Files:**
- Modify: `src/modules/caderno/gerador/texto-para-latex.ts`
- Create: `src/modules/caderno/repatriar/tipos.ts`
- Create: `src/modules/caderno/repatriar/reescrever-texto.spec.ts`
- Create: `src/modules/caderno/repatriar/reescrever-texto.ts`

- [ ] **Step 1: Exportar `acharImagens`**

Em `texto-para-latex.ts`, troque `function acharImagens` por `export function acharImagens`, e
`interface OcorrenciaDeImagem` por `export interface OcorrenciaDeImagem`.

Acrescente ao docblock dela:

```ts
/**
 * …
 *
 * ⚠️ **Exportada porque o card 08 usa a mesma definição.** Se a migração e o
 * gerador discordarem do que é um construto de imagem, a migração deixa para
 * trás exatamente as URLs que o gerador continua encontrando — e a métrica de
 * sucesso do card 08 (zero `origem: 'url'`) nunca fecha.
 */
```

⚠️ Mudança mínima: **nenhuma linha de lógica muda**. Rode `npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador` depois e confirme que continua tudo verde.

- [ ] **Step 2: Os tipos**

`src/modules/caderno/repatriar/tipos.ts`:

```ts
/** O que é preciso para desfazer uma escrita. */
export interface LinhaDeReversao {
  questaoId: string;
  campo: string;
  /** O texto INTEIRO do campo, antes. Não um diff: um diff pode não aplicar. */
  original: string;
}

/**
 * ⚠️ A falha é por URL, **não por campo**: a mesma URL pode estar em vários
 * campos da mesma questão, e dizer "campo: -" no relatório é pior que não
 * dizer nada.
 */
export interface Falha {
  questaoId: string;
  url: string;
  /** Vem do buscador quando é rede/endereço; fixo quando é formato ou R2. */
  motivo: string;
}

export interface ResultadoDaRepatriacao {
  questoesAlteradas: number;
  imagensBaixadas: number;
  imagensJaNoR2: number;
  falhas: Falha[];
}

/** Os campos de texto de uma questão que podem conter imagem. */
export const CAMPOS_DE_TEXTO = [
  'textoQuestao',
  'pergunta',
  'textoAlternativaA',
  'textoAlternativaB',
  'textoAlternativaC',
  'textoAlternativaD',
  'textoAlternativaE',
] as const;
```

- [ ] **Step 3: Escrever o teste que falha**

`src/modules/caderno/repatriar/reescrever-texto.spec.ts`:

```ts
import { acharUrlsExternas, chaveDaUrl, trocarUrl } from './reescrever-texto';

describe('acharUrlsExternas', () => {
  it('acha nos dois construtos', () => {
    expect(
      acharUrlsExternas('![](https://enem.dev/a.png) e <img src="https://x.com/b.jpg" />'),
    ).toEqual(['https://enem.dev/a.png', 'https://x.com/b.jpg']);
  });

  it('ignora o que já foi repatriado', () => {
    // Idempotência: rodar duas vezes não pode achar nada na segunda.
    expect(acharUrlsExternas('![](asset://assets/abc.png)')).toEqual([]);
  });

  it('ignora referência que não é http', () => {
    expect(acharUrlsExternas('![](img1) ![](data:image/png;base64,AAA)')).toEqual([]);
  });

  it('texto sem imagem devolve vazio', () => {
    expect(acharUrlsExternas('Enunciado com http://fonte.com citada em prosa')).toEqual([]);
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
      trocarUrl('<img src="https://x.com/a.png" width="320" />', 'https://x.com/a.png', 'assets/K.png'),
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
    const t = 'Veja ![](https://x.com/a.png)\n\nDisponível em: https://x.com/a.png. Acesso em 2025.';
    const r = trocarUrl(t, 'https://x.com/a.png', 'assets/K.png');
    expect(r).toContain('Disponível em: https://x.com/a.png. Acesso');
    expect(r).toContain('![](asset://assets/K.png)');
  });

  it('URL ausente devolve o texto intacto', () => {
    expect(trocarUrl('nada aqui', 'https://x.com/a.png', 'assets/K.png')).toBe('nada aqui');
  });
});
```

⚠️ Os dois últimos testes de `trocarUrl` são o motivo de ela **não** ser um `split/join` na URL: a
linha *"Disponível em: …"* aparece em quase toda questão do ENEM, e trocá-la corromperia a citação da
fonte.

- [ ] **Step 4: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/repatriar/reescrever-texto.spec.ts
```

Esperado: FAIL — `Cannot find module './reescrever-texto'`.

- [ ] **Step 5: Implementar**

`src/modules/caderno/repatriar/reescrever-texto.ts`:

```ts
import { createHash } from 'node:crypto';
import { acharImagens } from '../gerador/texto-para-latex';

/**
 * A parte pura da repatriação: achar as URLs e trocá-las por `asset://`.
 *
 * ⚠️ Usa o `acharImagens` do gerador de propósito. Se a migração e o gerador
 * discordarem do que é um construto de imagem, a migração deixa para trás
 * exatamente as URLs que o gerador continua encontrando.
 */

/** As URLs `http(s)` que estão DENTRO de um construto de imagem. */
export function acharUrlsExternas(texto: string): string[] {
  return acharImagens(texto ?? '')
    .map((o) => o.referencia)
    .filter((r) => /^https?:\/\//i.test(r));
}

/**
 * A chave no R2, derivada da URL.
 *
 * ⚠️ **Determinística, e não um uuid como o `uploadAsset` da api.** É o que
 * sustenta a ordem de escrita: se a gravação da questão falhar depois de a
 * imagem já ter subido, a re-execução encontra o objeto pelo HEAD, pula o
 * download e só atualiza o Mongo. Com uuid, a imagem ficaria órfã e a
 * re-execução criaria uma segunda cópia.
 */
export function chaveDaUrl(url: string, extensao: string): string {
  return `assets/${createHash('sha256').update(url).digest('hex')}.${extensao}`;
}

/**
 * Troca uma URL por `asset://<chave>`, **só dentro de construto de imagem**.
 *
 * ⚠️ Não é `split`/`replaceAll` na URL crua, por dois motivos medidos no
 * acervo:
 *
 * 1. Quase toda questão do ENEM tem uma linha "Disponível em: <url>. Acesso
 *    em …" citando a fonte. Trocá-la corromperia a citação.
 * 2. Substituição por prefixo pegaria `…/a.png.bak` ao trocar `…/a.png`.
 *
 * A troca é por posição, usando as ocorrências que o gerador reconhece — e de
 * trás para a frente, para os índices das anteriores continuarem válidos.
 *
 * ⚠️ De trás para a frente. Com chave real (83 caracteres contra ~40 da URL),
 * processar na ordem crescente desloca os índices seguintes e corrompe a
 * segunda ocorrência em diante.
 */
export function trocarUrl(texto: string, url: string, chave: string): string {
  const alvos = acharImagens(texto)
    .filter((o) => o.referencia === url)
    .sort((a, b) => b.inicio - a.inicio);

  let saida = texto;
  for (const alvo of alvos) {
    const trecho = saida.slice(alvo.inicio, alvo.fim);
    saida =
      saida.slice(0, alvo.inicio) +
      trecho.replace(url, `asset://${chave}`) +
      saida.slice(alvo.fim);
  }
  return saida;
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/repatriar src/modules/caderno/gerador
```

Esperado: PASS — os 12 novos, e a suíte do gerador **sem alteração**.

- [ ] **Step 7: Provar que duas decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| `trocarUrl` virar `texto.replaceAll(url, …)` | `não toca na URL citada em prosa` **e** `não toca em outra URL parecida` |
| `sort((a,b) => b.inicio - a.inicio)` virar ordem crescente | `troca todas as ocorrências daquela URL` |

A segunda é sutil: trocando da frente para trás, a primeira substituição muda o comprimento do texto e
os índices seguintes apontam para o lugar errado.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/modules/caderno/repatriar/reescrever-texto.ts src/modules/caderno/repatriar/reescrever-texto.spec.ts src/modules/caderno/repatriar/tipos.ts src/modules/caderno/gerador/texto-para-latex.ts
npx eslint src/modules/caderno/repatriar/reescrever-texto.ts src/modules/caderno/repatriar/reescrever-texto.spec.ts src/modules/caderno/repatriar/tipos.ts src/modules/caderno/gerador/texto-para-latex.ts
git add src/modules/caderno/repatriar/ src/modules/caderno/gerador/texto-para-latex.ts
git commit -m "$(cat <<'EOF'
feat(caderno): reescrita de texto pra repatriacao, e acharImagens exportada

Uma fonte so pro que e um construto de imagem: se a migracao e o gerador
discordarem, a migracao deixa pra tras exatamente as URLs que o gerador
continua achando -- e a metrica de sucesso do card nunca fecha.

A troca e POR POSICAO, nao replaceAll na URL: quase toda questao do ENEM
tem "Disponivel em: <url>. Acesso em ..." citando a fonte, e trocar isso
corromperia a citacao. Substituicao por prefixo tambem pegaria
`/a.png.bak` ao trocar `/a.png`.

Chave deterministica (sha256 da url), nao uuid: e o que sustenta a ordem
de escrita -- falha ao gravar a questao deixa a imagem achavel pelo HEAD,
e a re-execucao nao rebaixa.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 2: O repatriador — a ordem de escrita

**Files:**
- Create: `src/modules/caderno/repatriar/repatriador.spec.ts`
- Create: `src/modules/caderno/repatriar/repatriador.ts`

É o coração do card. Tudo o mais é encanamento.

- [ ] **Step 1: Escrever os testes que falham**

`src/modules/caderno/repatriar/repatriador.spec.ts`:

```ts
import { repatriarQuestao } from './repatriador';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const GIF = Buffer.from('GIF89a-resto');
const URL_A = 'https://enem.dev/a.png';

const montar = (over: any = {}) => {
  const eventos: string[] = [];
  const buscar =
    over.buscar ??
    jest.fn(async () => {
      eventos.push('buscar');
      return { ok: true as const, buffer: PNG };
    });
  const storage = {
    existe: over.existe ?? jest.fn(async () => (eventos.push('existe'), false)),
    gravar: over.gravar ?? jest.fn(async () => void eventos.push('gravar')),
  };
  const repositorio = {
    atualizarCampos:
      over.atualizarCampos ?? jest.fn(async () => void eventos.push('atualizar')),
  };
  const reversao = { registrar: jest.fn(async () => void eventos.push('reversao')) };
  return { buscar, storage, repositorio, reversao, eventos };
};

const questao = (over: any = {}) => ({
  _id: 'q1',
  textoQuestao: `![](${URL_A})`,
  ...over,
});

describe('repatriarQuestao — a ordem de escrita', () => {
  it('grava a imagem ANTES de tocar na questão', async () => {
    // ⚠️ É a regra do card. Uma questão apontando para uma key que não existe
    // é pior que a URL externa: a imagem some, e some em silêncio.
    const d = montar();
    await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.eventos).toEqual([
      'buscar',
      'existe',
      'gravar',
      'reversao',
      'atualizar',
    ]);
  });

  it('a reversão é registrada ANTES da escrita', async () => {
    const d = montar();
    await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.eventos.indexOf('reversao')).toBeLessThan(
      d.eventos.indexOf('atualizar'),
    );
    expect(d.reversao.registrar).toHaveBeenCalledWith({
      questaoId: 'q1',
      campo: 'textoQuestao',
      original: `![](${URL_A})`,
    });
  });

  it('falha ao gravar no R2 → a questão NÃO é tocada', async () => {
    const d = montar({
      gravar: jest.fn(async () => {
        throw new Error('R2 fora do ar');
      }),
    });
    const r = await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.repositorio.atualizarCampos).not.toHaveBeenCalled();
    expect(d.reversao.registrar).not.toHaveBeenCalled();
    expect(r.falhas[0]).toEqual({
      questaoId: 'q1',
      url: URL_A,
      motivo: 'falha ao gravar no R2',
    });
  });

  it('falha na busca → a questão NÃO é tocada', async () => {
    const d = montar({
      buscar: jest.fn(async () => ({ ok: false as const, motivo: 'endereço de imagem recusado' })),
    });
    const r = await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.storage.gravar).not.toHaveBeenCalled();
    expect(d.repositorio.atualizarCampos).not.toHaveBeenCalled();
    // O motivo do buscador atravessa: o relatório precisa distinguir
    // "recusado" de "não baixou".
    expect(r.falhas[0].motivo).toBe('endereço de imagem recusado');
  });

  it('formato não suportado → a questão NÃO é tocada', async () => {
    // pdflatex não inclui GIF. Repatriar não conserta isso — só moveria o
    // problema para dentro do nosso bucket.
    const d = montar({ buscar: jest.fn(async () => ({ ok: true as const, buffer: GIF })) });
    const r = await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.storage.gravar).not.toHaveBeenCalled();
    expect(r.falhas[0].motivo).toBe('formato não suportado');
  });
});

describe('repatriarQuestao — retomada', () => {
  it('objeto já no R2 → não rebaixa, e atualiza o Mongo', async () => {
    // ⚠️ É o caso de uma corrida anterior que gravou a imagem e falhou ao
    // gravar a questão. A chave determinística é o que torna isto possível.
    const d = montar({ existe: jest.fn(async () => true) });
    await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.storage.gravar).not.toHaveBeenCalled();
    expect(d.repositorio.atualizarCampos).toHaveBeenCalled();
  });

  it('questão já repatriada é ignorada por completo', async () => {
    const d = montar();
    const r = await repatriarQuestao(
      questao({ textoQuestao: '![](asset://assets/K.png)' }),
      d as any,
      { dryRun: false },
    );
    expect(d.eventos).toEqual([]);
    expect(r.questoesAlteradas).toBe(0);
  });
});

describe('repatriarQuestao — dryRun', () => {
  it('não busca, não grava e não atualiza', async () => {
    // ⚠️ Nem baixa: 64 MB de download não acrescentam informação que o
    // relatório não dê.
    const d = montar();
    const r = await repatriarQuestao(questao(), d as any, { dryRun: true });
    expect(d.eventos).toEqual([]);
    expect(r.questoesAlteradas).toBe(1); // conta o que FARIA
  });
});

describe('repatriarQuestao — vários campos e URLs', () => {
  it('a mesma URL em dois campos: um download, duas substituições', async () => {
    const d = montar();
    await repatriarQuestao(
      questao({ pergunta: `![](${URL_A})` }),
      d as any,
      { dryRun: false },
    );
    expect(d.buscar).toHaveBeenCalledTimes(1);
    const campos = d.repositorio.atualizarCampos.mock.calls[0][1];
    expect(Object.keys(campos).sort()).toEqual(['pergunta', 'textoQuestao']);
  });

  it('atualiza SÓ os campos que mudaram', async () => {
    // ⚠️ Nunca via `updateContent`: ele escreve também `alternativa`, que tem
    // `select: false` — um read-modify-write não preserva o que não lê.
    const d = montar();
    await repatriarQuestao(
      questao({ textoAlternativaA: 'texto sem imagem' }),
      d as any,
      { dryRun: false },
    );
    const campos = d.repositorio.atualizarCampos.mock.calls[0][1];
    expect(Object.keys(campos)).toEqual(['textoQuestao']);
    expect(campos).not.toHaveProperty('alternativa');
  });

  it('uma URL falha e outra passa: grava a que deu certo', async () => {
    const URL_B = 'https://enem.dev/b.png';
    const buscar = jest.fn(async (url: string) =>
      url === URL_B
        ? { ok: false as const, motivo: 'imagem não pôde ser baixada' }
        : { ok: true as const, buffer: PNG },
    );
    const d = montar({ buscar });
    const r = await repatriarQuestao(
      questao({ pergunta: `![](${URL_B})` }),
      d as any,
      { dryRun: false },
    );
    const campos = d.repositorio.atualizarCampos.mock.calls[0][1];
    expect(Object.keys(campos)).toEqual(['textoQuestao']);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].url).toBe(URL_B);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/repatriar/repatriador.spec.ts
```

Esperado: FAIL — `Cannot find module './repatriador'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/repatriar/repatriador.ts`:

```ts
import { extensaoDosBytes } from '../imagens/formato';
import { acharUrlsExternas, chaveDaUrl, trocarUrl } from './reescrever-texto';
import {
  CAMPOS_DE_TEXTO,
  LinhaDeReversao,
  ResultadoDaRepatriacao,
} from './tipos';

/**
 * Repatria as imagens de uma questão, na ordem que o card exige.
 *
 * ```
 * baixa → extensão → já está no R2? → grava → confirma → SÓ ENTÃO a questão
 * ```
 *
 * ⚠️ **Nunca escrever a questão antes de confirmar a imagem.** Uma questão
 * apontando para uma key que não existe é pior que a URL externa: a imagem
 * some, e some em silêncio.
 *
 * Falha até a confirmação: a questão **não é tocada**, e nada se perde.
 * Falha ao gravar a questão: a imagem fica no R2, e a re-execução a encontra
 * pela chave determinística — sem rebaixar.
 */

export interface Fronteiras {
  buscar: (url: string) => Promise<
    { ok: true; buffer: Buffer } | { ok: false; motivo: string }
  >;
  storage: {
    existe: (chave: string) => Promise<boolean>;
    gravar: (chave: string, bytes: Buffer) => Promise<void>;
  };
  repositorio: {
    /** `$set` APENAS nos campos passados. Nunca o `updateContent`. */
    atualizarCampos: (
      questaoId: string,
      campos: Record<string, string>,
    ) => Promise<void>;
  };
  reversao: { registrar: (linha: LinhaDeReversao) => Promise<void> };
}

export interface QuestaoParaRepatriar {
  _id: unknown;
  [campo: string]: unknown;
}

export async function repatriarQuestao(
  questao: QuestaoParaRepatriar,
  f: Fronteiras,
  opts: { dryRun: boolean },
): Promise<ResultadoDaRepatriacao> {
  const questaoId = String(questao._id);
  const resultado: ResultadoDaRepatriacao = {
    questoesAlteradas: 0,
    imagensBaixadas: 0,
    imagensJaNoR2: 0,
    falhas: [],
  };

  // Uma URL pode aparecer em vários campos: resolvida uma vez só.
  const urls = new Set<string>();
  for (const campo of CAMPOS_DE_TEXTO) {
    for (const u of acharUrlsExternas(String(questao[campo] ?? ''))) {
      urls.add(u);
    }
  }
  if (urls.size === 0) return resultado;

  if (opts.dryRun) {
    // ⚠️ Nem baixa. 64 MB de download não acrescentam informação que o
    // relatório não dê, e um dry-run que faz I/O não é um ensaio.
    resultado.questoesAlteradas = 1;
    return resultado;
  }

  const falhar = (url: string, motivo: string) =>
    resultado.falhas.push({ questaoId, url, motivo });

  const chavePorUrl = new Map<string, string>();
  for (const url of urls) {
    const busca = await f.buscar(url);
    // ⚠️ `=== false`, não `!busca.ok`: este repo tem `strictNullChecks: false`,
    // e sem ele o TS não estreita união discriminada por negação.
    if (busca.ok === false) {
      // O motivo vem do buscador — ele distingue "endereço recusado" de
      // "não pôde ser baixada", e o relatório precisa dessa diferença.
      falhar(url, busca.motivo);
      continue;
    }

    const extensao = extensaoDosBytes(busca.buffer);
    if (!extensao) {
      // pdflatex não inclui GIF nem WEBP. Repatriar não conserta isso — só
      // moveria o problema para dentro do nosso bucket.
      falhar(url, 'formato não suportado');
      continue;
    }

    const chave = chaveDaUrl(url, extensao);
    try {
      if (await f.storage.existe(chave)) {
        resultado.imagensJaNoR2 += 1;
      } else {
        await f.storage.gravar(chave, busca.buffer);
        resultado.imagensBaixadas += 1;
      }
    } catch {
      falhar(url, 'falha ao gravar no R2');
      continue;
    }
    chavePorUrl.set(url, chave);
  }

  if (chavePorUrl.size === 0) return resultado;

  // Só agora o texto é montado — com as imagens já confirmadas no R2.
  const campos: Record<string, string> = {};
  for (const campo of CAMPOS_DE_TEXTO) {
    const original = String(questao[campo] ?? '');
    let novo = original;
    for (const [url, chave] of chavePorUrl) novo = trocarUrl(novo, url, chave);
    if (novo !== original) campos[campo] = novo;
  }
  if (Object.keys(campos).length === 0) return resultado;

  // ⚠️ A reversão vem ANTES da escrita. Depois é tarde: se o processo morrer
  // entre as duas, fica uma questão alterada sem linha de desfazer.
  for (const campo of Object.keys(campos)) {
    await f.reversao.registrar({
      questaoId,
      campo,
      original: String(questao[campo] ?? ''),
    });
  }

  await f.repositorio.atualizarCampos(questaoId, campos);
  resultado.questoesAlteradas = 1;
  return resultado;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/repatriar
```

Esperado: PASS, 11 testes no `repatriador.spec.ts`.

- [ ] **Step 5: Provar que quatro decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| mover o `atualizarCampos` para antes do laço de imagens | `grava a imagem ANTES de tocar na questão` |
| registrar a reversão **depois** do `atualizarCampos` | `a reversão é registrada ANTES da escrita` |
| tirar o `try/catch` do `gravar` e deixar subir | `falha ao gravar no R2 → a questão NÃO é tocada` |
| no `dryRun`, deixar o `f.buscar` rodar | `não busca, não grava e não atualiza` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/repatriar/repatriador.ts src/modules/caderno/repatriar/repatriador.spec.ts
npx eslint src/modules/caderno/repatriar/repatriador.ts src/modules/caderno/repatriar/repatriador.spec.ts
git add src/modules/caderno/repatriar/repatriador.ts src/modules/caderno/repatriar/repatriador.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): repatriador -- a ordem de escrita

baixa -> extensao -> HEAD -> grava -> confirma -> SO ENTAO a questao.

Uma questao apontando pra key que nao existe e pior que a URL externa: a
imagem some, e some em silencio. Entao falha ate a confirmacao nao toca na
questao; falha ao gravar a questao deixa a imagem achavel pela chave
deterministica, e a re-execucao nao rebaixa.

A reversao e registrada ANTES da escrita. Depois e tarde: se o processo
morrer entre as duas, fica questao alterada sem linha de desfazer.

$set so nos campos que mudaram -- nunca o updateContent, que escreve
tambem `alternativa` (select: false, entao um read-modify-write nao
preserva o que nao le).

dryRun nao baixa: 64 MB nao acrescentam informacao que o relatorio nao de,
e um ensaio que faz I/O nao e ensaio.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 3: O CLI

**Files:**
- Create: `scripts/repatriar-imagens.ts`
- Modify: `package.json`

Fino de propósito: liga as fronteiras reais na lógica da Task 2, lê flags, imprime relatório. Sem
lógica de negócio — ela está testada em `src/`, e `scripts/` não é coberto pelo jest (`rootDir: src`).

Leia `scripts/backfill-criador-id.ts` antes: é o molde da casa para script de manutenção.

- [ ] **Step 1: Escrever o CLI**

`scripts/repatriar-imagens.ts`. O esqueleto, com o que precisa estar lá:

```ts
/**
 * Repatriação das imagens externas — Caderno · Overleaf, card 08.
 *
 * Baixa cada imagem hospedada fora, grava no nosso R2 e reescreve a referência
 * na questão.
 *
 * Uso:
 *   yarn repatriar:imagens --dry-run
 *   yarn repatriar:imagens --limite 5
 *   yarn repatriar:imagens
 *   yarn repatriar:imagens --reverter reversao-<timestamp>.jsonl
 *
 * ⚠️ ESTE SCRIPT ESCREVE NO ACERVO. Rode `--dry-run` primeiro, depois
 * `--limite 5`, e confira as cinco questões antes da corrida completa.
 */
import 'dotenv/config';
import * as fs from 'fs';
import mongoose from 'mongoose';
```

O que ele monta:

- **`buscar`** → o `buscarImagem` de `src/modules/caderno/imagens/buscador-http.ts`. **Reusa**, não
  reimplementa: ele já faz faixas privadas, redirecionamento manual com re-checagem por salto, timeout
  e teto de bytes durante a leitura.
- **`storage.existe` / `storage.gravar`** → `StorageService`, com o bucket de `QUESTAO_BUCKET`.
  ⚠️ **Escrita**, então a credencial precisa de permissão de escrita nesse bucket — diferente do card
  03, que só lê.
- **`repositorio.atualizarCampos`** → `db.collection('questaos').updateOne({_id}, {$set: campos})`,
  direto pelo driver, como o `backfill-criador-id` faz. **Nunca** o `updateContent`.
- **`reversao.registrar`** → uma linha JSON por campo, `fs.appendFileSync`, num arquivo
  `reversao-<timestamp>.jsonl`.
  ⚠️ `appendFileSync`, não acumular em memória e gravar no fim: se o processo morrer no meio, o que já
  foi escrito precisa estar em disco.
- **`auditlogs`** → uma entrada por questão alterada, inserida direto na coleção pelo driver:
  `{ user: 'system', entityId, entityType: 'Questao', changes: JSON.stringify({ repatriadas: N }) }`.
  ⚠️ É **rastreabilidade, não desfazer** — o `changes` do `auditLog` guarda só o valor novo, e quem
  reverte é o arquivo. Fica no mesmo lugar onde as outras alterações de questão aparecem, e `'system'`
  é a mesma sentinela que o `backfill-criador-id` usa.

E o relatório final, que é o que fecha o gate:

```
questões varridas .......... N
questões alteradas ......... N
imagens baixadas ........... N
imagens já no R2 ........... N
falhas ..................... N
  <agrupadas por motivo, com a contagem de cada>
arquivo de reversão ........ reversao-<timestamp>.jsonl
```

⚠️ **Em `--dry-run`, não criar o arquivo de reversão** — não há o que reverter, e um arquivo vazio no
diretório confunde na hora de escolher qual usar.

### O `--reverter`

Lê o `.jsonl` e, para cada linha, `$set` do campo com o `original`. Idempotente: aplicar duas vezes dá
o mesmo resultado.

⚠️ **Não apaga as imagens do R2.** Jogaria fora o que já foi baixado, e a chave determinística faz a
próxima corrida reaproveitá-las.

- [ ] **Step 2: O script no `package.json`**

```json
"repatriar:imagens": "ts-node scripts/repatriar-imagens.ts",
```

Ao lado de `backfill:criador-id`.

- [ ] **Step 3: Verificar que o build não se mexeu**

```bash
npx tsc --noEmit -p tsconfig.json
yarn build && ls dist/main.js && rm -rf dist
```

⚠️ `dist/main.js` **na raiz**. `scripts/` já está no `exclude` do `tsconfig.build.json`; se
`dist/src/main.js` aparecer, algo saiu do lugar e o PM2 quebra com "Script not found" — **pare e
reporte**.

- [ ] **Step 4: A suíte inteira do caderno**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno
```

- [ ] **Step 5: Commit**

```bash
npx prettier --write scripts/repatriar-imagens.ts
npx eslint scripts/repatriar-imagens.ts
git add scripts/repatriar-imagens.ts package.json
git commit -m "$(cat <<'EOF'
feat(caderno): CLI da repatriacao de imagens

Fino de proposito: liga as fronteiras reais na logica testada em src/. O
jest tem rootDir=src, entao logica em scripts/ nao teria cobertura.

Reusa o buscarImagem do card 03 -- faixas privadas, redirect manual com
re-checagem por salto, timeout e teto de bytes ja estao la.

O arquivo de reversao e escrito com appendFileSync, linha a linha: se o
processo morrer no meio, o que ja foi escrito precisa estar em disco.

--reverter nao apaga as imagens do R2: jogaria fora o que ja foi baixado,
e a chave deterministica faz a proxima corrida reaproveita-las.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 4: Gate — `--dry-run` contra homologação. **PARA e espera o usuário**

- [ ] **Step 1: O ensaio**

```bash
yarn repatriar:imagens --dry-run
```

⚠️ Ele **não escreve em lugar nenhum** — nem Mongo, nem R2 — e **não baixa**.

Confira o relatório contra os números medidos:

| | esperado (homologação) |
|---|---|
| questões alteradas | **728** |
| URLs distintas | **818** |

⚠️ **Se divergir, pare e reporte.** Divergência aqui significa que o critério de busca não é o mesmo
que eu medi — e descobrir isso depois de escrever 728 questões é tarde.

- [ ] **Step 2: Cinco questões, de verdade**

```bash
yarn repatriar:imagens --limite 5
```

Depois, para cada uma das cinco, conferir **no banco**:

- o campo tem `asset://assets/<64 hex>.<ext>` no lugar da URL
- a linha *"Disponível em: …"* da fonte, se houver, **continua com a URL original**
- o objeto existe no R2, sob aquela chave exata
- o `alternativa` da questão **não mudou**
- o arquivo de reversão tem uma linha por campo alterado

- [ ] **Step 3: Provar o desfazer**

```bash
yarn repatriar:imagens --reverter reversao-<timestamp>.jsonl
```

Conferir que as cinco questões voltaram ao texto original, byte a byte. **Esta é a prova que autoriza
a corrida completa** — sem ela, não há volta.

- [ ] **Step 4: PARE**

Reporte ao usuário: o relatório do dry-run contra os números esperados, o que as cinco questões
mostraram, e que a reversão funcionou.

⚠️ **A corrida completa é decisão do usuário, não sua.** Não rode `yarn repatriar:imagens` sem limite.

---

### Task 5: Fechar

- [ ] **Step 1: Cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='modules/caderno/repatriar/**/*.ts' src/modules/caderno
```

Esperado: ≥ 90% em statements. Abaixo, acrescente teste — nunca `istanbul ignore`.

- [ ] **Step 2: Suíte e build**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta
yarn build && ls dist/main.js && rm -rf dist
```

- [ ] **Step 3: Nada fora do escopo**

```bash
git diff poc/caderno-overleaf..HEAD --name-only
```

Esperado: os arquivos da tabela de estrutura, mais os dois de `docs/`. ⚠️ A única mudança em código
existente deve ser o `export` em `texto-para-latex.ts`.

- [ ] **Step 4: Abrir o PR contra a POC**

```bash
git push -u origin feature/caderno-08-repatriar-imagens
gh pr create --base poc/caderno-overleaf --title "[Caderno · Overleaf] Card 08 — repatriar as imagens externas"
```

O corpo precisa cobrir: as três correções medidas ao card (filtro que migraria zero, dedup de 2,6%,
URL morta teórica); a chave determinística e por que ela sustenta a ordem; a ordem de escrita e o que
acontece em cada falha; o `updateContent` que não pode ser usado e por quê; o arquivo de reversão e o
`auditLog` que não serve; e **que a corrida completa ainda não foi feita**.

⚠️ `--base poc/caderno-overleaf`, **não** `develop`.

## O que este card NÃO faz

**Não roda a migração completa.** O PR entrega o script testado, o dry-run conferido e a reversão
provada. Apertar o botão é decisão do usuário.

**Não apaga as imagens do R2 no rollback.** Ver Task 3.

**Não conserta o `auditLog`.** Ele guarda só o valor novo, e isso é limitação dele, não deste card —
que resolve o próprio desfazer com o arquivo de reversão. Registrado como observação.
