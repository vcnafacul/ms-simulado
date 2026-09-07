# Caderno LaTeX — Card 02: conversor markdown → LaTeX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traduzir o markdown com LaTeX inline que o editor de questões produz para LaTeX encaixável no template do card 01, sem nunca lançar exceção e reportando em português o que não foi entendido.

**Architecture:** Função pura síncrona. Três pré-transformações independentes consertam o que o parser erra (`R$` virando math, display math perdido, HTML fatiado em irmãos), e só então um compiler burro caminha o mdast com um handler por tipo de nó. Escaper e sanitizador de matemática são módulos próprios porque um é reusado pelo card 03 e o outro é código de segurança.

**Tech Stack:** `unified@11` + `remark-parse@11` + `remark-gfm@4` + `remark-math@6` (ESM-only, carregados por `require(esm)`), TypeScript CommonJS, Jest 29 + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-07-caderno-conversor-markdown-latex-design.md` (commit `3deaee6`)

---

## Contexto que o plano assume

**Não há distribuição TeX nesta máquina, e instalar está fora de escopo.** O critério do card que pede "cada `expected.tex` compila dentro do template do card 01" vira um gate manual (Task 10), igual ao card 01. Nunca tente compilar LaTeX.

**A stack é ESM-only e o projeto é CommonJS.** Funciona porque o Node 20.19 retroportou `require(esm)`; medido em 20.19.6 local e 20.20.2 na imagem `node:20-alpine`. Um `import` estático basta e **o conversor fica síncrono** — não introduza `async` em lugar nenhum.

**Quatro achados medidos estão na spec**, três contradizendo o card original. Leia a seção "Achados empíricos" antes de começar: eles são a razão de existirem três pré-transformações.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/markdown/escape-latex.ts` | Escapar texto para LaTeX. Exportado à parte: o card 03 usa. |
| `src/modules/caderno/markdown/sanitizar-math.ts` | Detectar comando barrado dentro de fórmula. Código de segurança. |
| `src/modules/caderno/markdown/pre-transform/visitar.ts` | Walker mínimo do mdast, compartilhado. |
| `src/modules/caderno/markdown/pre-transform/neutralizar-real.ts` | `R$` → marcador, antes do parser. String → string. |
| `src/modules/caderno/markdown/pre-transform/restaurar-display.ts` | Marcar os `inlineMath` que eram `$$`, pelo offset. |
| `src/modules/caderno/markdown/pre-transform/agrupar-html.ts` | Casar `<div>`/`</div>` fatiados em irmãos. |
| `src/modules/caderno/markdown/handlers.ts` | Um handler por tipo de nó + dispatcher. |
| `src/modules/caderno/markdown/markdown-to-latex.ts` | Entrada pública: orquestra o pipeline. |
| `src/modules/caderno/markdown/fixtures/` | `input.md` + `expected.tex` por construção. |

Ordem de implementação é de baixo pra cima: cada peça é testável sozinha antes de existir consumidor.

---

### Task 1: Dependências e piso de Node

**Files:**
- Modify: `package.json`
- Modify: `ms.dockerfile`
- Create: `src/modules/caderno/markdown/stack.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/stack.spec.ts`:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/**
 * A stack do remark é ESM-only (`"type": "module"`) e este projeto é CommonJS.
 * Funciona porque o Node 20.19 retroportou `require(esm)` — que é no que o TS
 * transforma estes `import` estáticos.
 *
 * Este teste é a rede de segurança do piso de Node: num Node anterior a 20.19
 * ele falha aqui, no import, alto e imediato, em vez de o serviço quebrar no
 * boot em produção.
 */
describe('stack do remark sob CommonJS', () => {
  it('carrega de forma síncrona, sem async', () => {
    expect(typeof unified).toBe('function');
  });

  it('parseia math inline e tabela GFM', () => {
    const arvore: any = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .parse('Com $x^2$ e:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');

    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'paragraph',
      'table',
    ]);
    expect(arvore.children[0].children.map((n: any) => n.type)).toContain(
      'inlineMath',
    );
  });

  it('roda num Node que suporta require(esm)', () => {
    // ⚠️ Estes testes NÃO exercitam o require(esm): sob Jest a stack chega
    // transpilada pelo ts-jest, de propósito. Quem exercita é só a produção.
    // Então o único guarda real do piso é este — a versão em execução.
    const [maior, menor] = process.versions.node.split('.').map(Number);
    expect(maior > 20 || (maior === 20 && menor >= 19)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/stack.spec.ts
```

Esperado: FAIL — `Cannot find module 'unified'`.

- [ ] **Step 3: Instalar as dependências**

```bash
yarn add unified@^11 remark-parse@^11 remark-gfm@^4 remark-math@^6
yarn add -D @types/mdast@^4
```

Confira no `package.json` que as quatro entraram em `dependencies` (são runtime, não build).

- [ ] **Step 4: Declarar o piso de Node**

Adicionar ao `package.json`, no nível de topo (ao lado de `"scripts"`):

```json
  "engines": {
    "node": ">=20.19"
  },
```

- [ ] **Step 5: Registrar o motivo no Dockerfile**

Em `ms.dockerfile`, acrescentar um comentário imediatamente acima da **primeira** linha `FROM node:20-alpine`:

```dockerfile
# Node >= 20.19 e obrigatorio: a stack do remark e ESM-only e o projeto e
# CommonJS, entao depende do require(esm) que so existe a partir dessa versao.
# Nao pinar uma 20.x anterior sem antes trocar a stack.
```

> **Descoberto na execução, e o plano original não previa.** O `require(esm)` do Node **não vale
> dentro do Jest**: o `jest-runtime` tem loader CommonJS próprio, ignora o backport, e tenta executar
> o fonte ESM como CJS — `SyntaxError: Unexpected token 'export'`. Produção funciona, teste não.
> Medido: `transformIgnorePatterns` sozinho não resolve, porque o `ts-jest` recusa `.js` sem
> `allowJs`. Com um tsconfig só para o Jest, passa. Custo: ~15 s na primeira rodada (cache frio,
> transformando a árvore ESM) e ~1,3 s nas seguintes; sem regressão nas 12 suítes existentes.
>
> **E o `engines` não é advisório aqui.** Verificado pondo `>=99` e rodando `yarn install`: o yarn
> classic 1.22.22 — o mesmo binário que o `ms.dockerfile` usa com `--frozen-lockfile` — falha com
> exit 1 e `The engine "node" is incompatible`. O piso está enforçado no caminho que o CI e o Docker
> percorrem, não só declarado.

- [ ] **Step 5b: Fazer o Jest enxergar a stack ESM**

Criar `tsconfig.jest.json` na raiz do repo. Arquivo separado de propósito: `allowJs` no
`tsconfig.json` mudaria o build de produção, e só o Jest precisa disso.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "allowJs": true }
}
```

No bloco `jest` do `package.json`, trocar o `transform` e acrescentar `transformIgnorePatterns`
(o `<rootDir>/../` é porque o `rootDir` do Jest aqui é `src`, não a raiz):

```json
    "transform": {
      "^.+\\.(t|j)s$": ["ts-jest", { "tsconfig": "<rootDir>/../tsconfig.jest.json" }]
    },
    "transformIgnorePatterns": [
      "node_modules/(?!(unified|remark-.*|mdast-.*|micromark.*|unist-.*|vfile.*|bail|trough|is-plain-obj|extend|devlop|decode-named-character-reference|character-entities.*|ccount|escape-string-regexp|markdown-table|longest-streak|zwitch)/)"
    ],
```

Copiar as mesmas duas chaves para `test/jest-e2e.json`. Está verde hoje porque nada em e2e importa
remark, mas nas tasks seguintes o conversor entra num módulo Nest e os specs e2e sobem o `AppModule`
— a primeira rodada depois disso quebraria num arquivo que ninguém editou. ⚠️ O `rootDir` de lá é
`..` (a raiz do projeto), não `src`: o caminho vira `<rootDir>/tsconfig.jest.json`, **sem** o `../`.

A explicação de tudo isso vai num comentário JSONC no topo do `tsconfig.jest.json` — o `package.json`
não aceita comentário, e é para o `tsconfig.jest.json` que tanto a regex quanto o `transform`
apontam. Quem abrir o `package.json` e vir a regex precisa de um caminho até a razão dela.

⚠️ **Não** acrescente teste que assere o conteúdo dessa configuração: se ela sumir, os dois testes
acima já quebram no import. Um teste que lê o `package.json` e o compara com ele mesmo é tautológico.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/stack.spec.ts
```

Esperado: PASS, 3 testes. A primeira rodada leva ~15 s (cache frio); a segunda, ~1,3 s.

- [ ] **Step 7: Confirmar que o build continua íntegro**

```bash
yarn build && ls dist/main.js && rm -rf dist
```

Esperado: `dist/main.js`. Este passo existe porque este repo já teve o `dist/main.js` deslocado por arquivo fora de `src/`; as novas dependências não deveriam causar isso, mas custa um `ls`.

- [ ] **Step 8: Commit**

```bash
git add package.json yarn.lock ms.dockerfile tsconfig.jest.json test/jest-e2e.json README.md src/modules/caderno/markdown/
git commit -m "build(caderno): stack do remark e piso de Node 20.19

unified/remark sao ESM-only e o projeto e CommonJS. Funciona pelo
require(esm), retroportado no Node 20.19 -- e por isso o conversor pode
ser sincrono, sem contaminar o contrato do card 03.

O piso vira explicito em engines e comentado no Dockerfile: pinar uma
20.x anterior quebraria o boot."
```

---

### Task 2: `escapeLatex`

**Files:**
- Create: `src/modules/caderno/markdown/escape-latex.ts`
- Create: `src/modules/caderno/markdown/escape-latex.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/escape-latex.spec.ts`:

```ts
import { escapeLatex } from './escape-latex';

describe('escapeLatex', () => {
  it('escapa os caracteres especiais do LaTeX', () => {
    expect(escapeLatex('R$ 50,00')).toBe('R\\$ 50,00');
    expect(escapeLatex('100% dos casos')).toBe('100\\% dos casos');
    expect(escapeLatex('a_b')).toBe('a\\_b');
    expect(escapeLatex('#hashtag')).toBe('\\#hashtag');
    expect(escapeLatex('C&A')).toBe('C\\&A');
    expect(escapeLatex('{chaves}')).toBe('\\{chaves\\}');
  });

  it('escapa os quatro que o escape-latex não cobre', () => {
    // Sem estes, com fontes T1/OT1 o `a < b` renderiza como `a ¡ b`.
    expect(escapeLatex('a < b')).toBe('a \\textless{} b');
    expect(escapeLatex('a > b')).toBe('a \\textgreater{} b');
    expect(escapeLatex('a | b')).toBe('a \\textbar{} b');
    expect(escapeLatex('til ~ aqui')).toBe('til \\textasciitilde{} aqui');
    expect(escapeLatex('chapeu ^ aqui')).toBe('chapeu \\textasciicircum{} aqui');
  });

  it('não reescapa o que ele mesmo acabou de inserir', () => {
    // A armadilha: num escape em várias passadas, a barra vira
    // \textbackslash{} e a passada seguinte escapa as chaves DELE,
    // produzindo \textbackslash\{\}. Tem que ser passada única.
    expect(escapeLatex('a\\b')).toBe('a\\textbackslash{}b');
    expect(escapeLatex('\\')).toBe('\\textbackslash{}');
  });

  it('escapa a aspa dupla, que o babel[brazil] torna ativa', () => {
    // O babel em português declara os atalhos "< "> "- "" "|. Sem escapar,
    // `""` vira salto de largura zero e `"-` vira hífen discricionário: as
    // aspas somem da prova impressa, sem erro nenhum.
    expect(escapeLatex('a resposta é "" (vazio)')).toBe(
      'a resposta é \\textquotedbl{}\\textquotedbl{} (vazio)',
    );
  });

  it('a classe do regex e o mapa não saem de sincronia', () => {
    // MAPA[c] é tipado como string mesmo sem a chave existir (o tsconfig não
    // tem noUncheckedIndexedAccess), então esquecer uma entrada compila limpo
    // e imprime "undefined" na prova de alguém.
    const transformados = Array.from({ length: 128 }, (_, i) =>
      String.fromCharCode(i),
    ).filter((c) => escapeLatex(c) !== c);

    expect(transformados.join('')).toBe('"#$%&<>\\^_{|}~');
    expect(transformados.map(escapeLatex).join('')).not.toContain('undefined');
  });

  it('devolve string vazia intacta e não mexe em texto comum', () => {
    expect(escapeLatex('')).toBe('');
    expect(escapeLatex('texto sem nada especial')).toBe(
      'texto sem nada especial',
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/escape-latex.spec.ts
```

Esperado: FAIL — `Cannot find module './escape-latex'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/markdown/escape-latex.ts`:

```ts
/**
 * Escapa texto para LaTeX.
 *
 * Não usa a lib `escape-latex`: ela está congelada desde 2018 e não trata
 * `~`, `<`, `>` nem `|` — e com fontes T1/OT1 um `a < b` renderiza como
 * `a ¡ b`. São dez linhas de regex, não justificam dependência.
 *
 * ⚠️ Passada ÚNICA, de propósito. Escapar em várias passadas quebra: a barra
 * invertida vira `\textbackslash{}` e a passada seguinte escaparia as chaves
 * que ela mesma inseriu, produzindo `\textbackslash\{\}`.
 */
const MAPA: Record<string, string> = {
  '\\': '\\textbackslash{}',
  // O babel[brazil] do preambulo torna `"` ATIVO e declara os atalhos
  // "< "> "- "" "|. Sem escapar, `""` vira salto de largura zero e `"-` vira
  // hifen discricionario: as aspas somem da prova, sem erro nenhum.
  '"': '\\textquotedbl{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
};

export function escapeLatex(texto: string): string {
  return texto.replace(/["\\{}$&#_%~^<>|]/g, (c) => MAPA[c]);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/escape-latex.spec.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/markdown/escape-latex.ts src/modules/caderno/markdown/escape-latex.spec.ts
git commit -m "feat(caderno): escapeLatex em passada unica

Cobre os quatro que o escape-latex nao trata (~ < > |), que com fontes
T1/OT1 fazem 'a < b' virar 'a ¡ b'.

Passada unica de proposito: em varias passadas a barra vira
\\textbackslash{} e a passada seguinte escapa as chaves dela."
```

---

### Task 3: `sanitizarMath`

**Files:**
- Create: `src/modules/caderno/markdown/sanitizar-math.ts`
- Create: `src/modules/caderno/markdown/sanitizar-math.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/sanitizar-math.spec.ts`:

```ts
import { comandoBarrado } from './sanitizar-math';

describe('comandoBarrado', () => {
  it('barra comandos que leem ou escrevem arquivo', () => {
    expect(comandoBarrado('\\input{/etc/passwd}')).toBe('\\input');
    expect(comandoBarrado('\\include{segredo}')).toBe('\\include');
    expect(comandoBarrado('\\openin1=/tmp/x')).toBe('\\openin');
    expect(comandoBarrado('\\read1 to \\linha')).toBe('\\read');
  });

  it('barra escrita e manipulação de catcode', () => {
    expect(comandoBarrado('\\write18{rm -rf /}')).toBe('\\write18');
    expect(comandoBarrado('\\write1{x}')).toBe('\\write');
    expect(comandoBarrado('\\catcode`\\@=11')).toBe('\\catcode');
    expect(comandoBarrado('\\csname input\\endcsname')).toBe('\\csname');
  });

  it('deixa passar fórmula legítima', () => {
    expect(comandoBarrado('\\frac{1}{2}')).toBeNull();
    expect(comandoBarrado('\\int_0^1 x\\,dx')).toBe(null);
    expect(comandoBarrado('x^2 + y^2 = z^2')).toBeNull();
    expect(comandoBarrado('\\alpha \\beta \\gamma')).toBeNull();
    expect(comandoBarrado('')).toBeNull();
  });

  it('não confunde comando barrado com prefixo de outro', () => {
    // \inputs e \reader não existem, mas se existissem não seriam \input
    // nem \read. O limite de nome do LaTeX é o primeiro não-letra.
    expect(comandoBarrado('\\inputs{x}')).toBeNull();
    expect(comandoBarrado('\\reader')).toBeNull();
    expect(comandoBarrado('\\writes')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/sanitizar-math.spec.ts
```

Esperado: FAIL — `Cannot find module './sanitizar-math'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/markdown/sanitizar-math.ts`:

```ts
/**
 * Comandos LaTeX barrados dentro de fórmula.
 *
 * A matemática passa sem escape — o editor grava LaTeX de verdade e escapar
 * mataria a feature. Mas isso abre um canal: quem cadastra questão pode
 * escrever `$\input{/etc/passwd}$`, o KaTeX mostra erro no editor e salva
 * mesmo assim, e o `.tex` gerado carrega o comando intacto.
 *
 * Na fase 1 quem compila é o usuário, na máquina dele ou no Overleaf — as
 * proteções que o card 08 planeja (`openin_any=p`, `-no-shell-escape`) não
 * existem lá. Esta lista é o que cobre essa janela.
 *
 * ⚠️ Defesa em profundidade, NÃO substituto: o card 08 continua obrigado a
 * configurar o compilador do servidor.
 *
 * São oito comandos que nenhuma fórmula de prova usa, então o falso positivo
 * é quase zero. `write18` vem antes de `write` na alternância porque a regex
 * casa a primeira alternativa que serve.
 */
const BARRADOS = [
  'write18',
  'write',
  'input',
  'include',
  'openin',
  'read',
  'catcode',
  'csname',
];

/** `(?![A-Za-z])` é o limite de nome do LaTeX: `\inputs` não é `\input`. */
const PADRAO = new RegExp(`\\\\(${BARRADOS.join('|')})(?![A-Za-z])`);

/** Devolve o comando barrado encontrado, ou `null` se a fórmula está limpa. */
export function comandoBarrado(formula: string): string | null {
  const achado = PADRAO.exec(formula);
  return achado ? `\\${achado[1]}` : null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/sanitizar-math.spec.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/markdown/sanitizar-math.ts src/modules/caderno/markdown/sanitizar-math.spec.ts
git commit -m "feat(caderno): barrar comandos de arquivo dentro de formula

A matematica passa sem escape porque o editor grava LaTeX de verdade,
mas isso abre um canal: \\input{/etc/passwd} numa formula sai intacto no
.tex. Na fase 1 quem compila e o usuario, sem as protecoes do card 08.

Oito comandos que nenhuma formula de prova usa. Defesa em profundidade,
nao substituto do openin_any=p."
```

---

### Task 4: `visitar` e `neutralizarReal`

**Files:**
- Create: `src/modules/caderno/markdown/pre-transform/visitar.ts`
- Create: `src/modules/caderno/markdown/pre-transform/neutralizar-real.ts`
- Create: `src/modules/caderno/markdown/pre-transform/neutralizar-real.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/pre-transform/neutralizar-real.spec.ts`:

```ts
import { MARCADOR_REAL, neutralizarReal } from './neutralizar-real';

const m = MARCADOR_REAL;

describe('neutralizarReal', () => {
  it('neutraliza R$ de dinheiro', () => {
    expect(neutralizarReal('custa R$ 50,00')).toBe(`custa ${m} 50,00`);
    expect(neutralizarReal('R$ 1.200 no mês')).toBe(`${m} 1.200 no mês`);
    expect(neutralizarReal('taxa de R$5')).toBe(`taxa de ${m}5`);
  });

  it('neutraliza os dois R$ do parágrafo, que é o caso que quebra', () => {
    // Sem isso, o remark-math casa os dois cifrões e o texto entre eles
    // vira inlineMath(" 50,00 e outro R").
    expect(neutralizarReal('custa R$ 50,00 e outro R$ 30,00')).toBe(
      `custa ${m} 50,00 e outro ${m} 30,00`,
    );
  });

  it('NÃO destrói $R$, que é fórmula legítima', () => {
    // R de raio, de resistência. A regra ingênua transformaria isto em
    // "O raio $ e o dobro", e o cifrão órfão quebraria a matemática do
    // resto do parágrafo.
    expect(neutralizarReal('O raio $R$ e o dobro.')).toBe(
      'O raio $R$ e o dobro.',
    );
    expect(neutralizarReal('Área $\\pi R^2$ com R$ 5 de taxa.')).toBe(
      `Área $\\pi R^2$ com ${m} 5 de taxa.`,
    );
  });

  it('preserva fórmula e dinheiro no mesmo parágrafo', () => {
    expect(neutralizarReal('A resistência $R$ custa R$ 12,00.')).toBe(
      `A resistência $R$ custa ${m} 12,00.`,
    );
  });

  it('não mexe em matemática comum nem em texto sem R$', () => {
    expect(neutralizarReal('A função $f(x)=x^2$ é par.')).toBe(
      'A função $f(x)=x^2$ é par.',
    );
    expect(neutralizarReal('')).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/pre-transform/neutralizar-real.spec.ts
```

Esperado: FAIL — `Cannot find module './neutralizar-real'`.

- [ ] **Step 3: Implementar o `neutralizarReal`**

Criar `src/modules/caderno/markdown/pre-transform/neutralizar-real.ts`:

```ts
/**
 * Neutraliza o `R$` de valores em real ANTES do parser.
 *
 * Medido: `custa R$ 50,00 e outro R$ 30,00` faz o `remark-math` casar os dois
 * cifrões e produzir `inlineMath(" 50,00 e outro R")`. Em prova brasileira
 * isso é comum, não exótico. Pior: `R$ 80,00 resulta em $0{,}8 \times 80$`
 * engole a prosa E quebra a fórmula legítima que vinha depois.
 *
 * Tem que ser antes do parser: o estrago acontece na tokenização, e depois de
 * virar nó `inlineMath` a informação já se perdeu.
 *
 * Desligar `singleDollarTextMath` não serve — o editor grava math inline como
 * `$x^2$`, então desligar mataria a feature principal.
 *
 * ⚠️ A âncora `(^|[^$])` à esquerda é o que protege `$R$`, que é fórmula
 * legítima e comuníssima (R de raio, de resistência). Sem ela,
 * `O raio $R$ e o dobro` vira `O raio $ e o dobro` e o cifrão órfão quebra a
 * matemática do resto do parágrafo.
 */
const PADRAO = /(^|[^$])R\$(?=[\s\d])/g;

/**
 * Caractere de uso privado do Unicode. O remark não atribui significado a ele,
 * então ele atravessa o parser intacto. O handler de `text` o devolve como
 * `R\$` no LaTeX.
 */
export const MARCADOR_REAL = '\uE000';

export function neutralizarReal(markdown: string): string {
  return markdown.replace(PADRAO, `$1${MARCADOR_REAL}`);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/pre-transform/neutralizar-real.spec.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Criar o walker compartilhado**

As tasks 5 e 6 precisam caminhar a árvore. Criar `src/modules/caderno/markdown/pre-transform/visitar.ts`:

```ts
/**
 * Walker mínimo do mdast, em pré-ordem.
 *
 * Existe em vez do `unist-util-visit` por ser seis linhas contra mais uma
 * dependência ESM — e porque o `agrupar-html` precisa mexer no array de
 * filhos durante a caminhada, o que o visit da lib desencoraja.
 *
 * ⚠️ Não use este walker para transformações que alterem `children`: ele
 * itera o array vivo. O `agrupar-html` faz a própria recursão por isso.
 */
export function visitar(no: any, fn: (no: any) => void): void {
  fn(no);
  if (Array.isArray(no?.children)) {
    for (const filho of no.children) visitar(filho, fn);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/caderno/markdown/pre-transform/
git commit -m "feat(caderno): neutralizar R\$ antes do parser

Medido: dois R\$ no mesmo paragrafo fazem o remark-math casar os cifroes
e o texto entre eles virar inlineMath. O card afirmava que passava
ileso; nao passa.

A ancora a esquerda protege \$R\$, que e formula legitima e comum (raio,
resistencia) e que a regra ingenua destruiria."
```

---

### Task 5: `restaurarDisplay`

**Files:**
- Create: `src/modules/caderno/markdown/pre-transform/restaurar-display.ts`
- Create: `src/modules/caderno/markdown/pre-transform/restaurar-display.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/pre-transform/restaurar-display.spec.ts`:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { EH_DISPLAY, restaurarDisplay } from './restaurar-display';
import { visitar } from './visitar';

const parse = (md: string): any =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(md);

/** Devolve [valor, éDisplay] de cada nó de matemática, na ordem. */
function matematicas(md: string): [string, boolean][] {
  const arvore = parse(md);
  restaurarDisplay(arvore, md);
  const achados: [string, boolean][] = [];
  visitar(arvore, (no: any) => {
    if (no.type === 'inlineMath' || no.type === 'math') {
      achados.push([no.value, no.data?.[EH_DISPLAY] === true]);
    }
  });
  return achados;
}

describe('restaurarDisplay', () => {
  it('marca como display o que veio com $$', () => {
    // O editor grava display como $$formula$$ numa linha só, e o remark-math
    // só produz nó display com delimitador em linha própria — então tudo
    // chega como inlineMath e a distinção se perde.
    expect(matematicas('$$\\int_0^1 x\\,dx$$')).toEqual([
      ['\\int_0^1 x\\,dx', true],
    ]);
  });

  it('não marca o que veio com um cifrão só', () => {
    expect(matematicas('A função $f(x)=x^2$ é par.')).toEqual([
      ['f(x)=x^2', false],
    ]);
  });

  it('distingue os dois no mesmo parágrafo', () => {
    expect(matematicas('Temos $a^2$ e também $$b^2$$ aqui.')).toEqual([
      ['a^2', false],
      ['b^2', true],
    ]);
  });

  it('não quebra quando não há matemática nenhuma', () => {
    expect(matematicas('Texto comum, sem fórmula.')).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/pre-transform/restaurar-display.spec.ts
```

Esperado: FAIL — `Cannot find module './restaurar-display'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/markdown/pre-transform/restaurar-display.ts`:

```ts
import { visitar } from './visitar';

/** Chave em `node.data` que marca uma fórmula como display. */
export const EH_DISPLAY = 'cadernoDisplay';

/**
 * Restaura a distinção display/inline que o parser perde.
 *
 * Medido: o `remark-math` só produz nó `math` (display) quando os
 * delimitadores estão em linhas próprias. O editor
 * (`serializeInlineContent`) grava `$$formula$$` numa linha só, inline no
 * parágrafo — então todo display chega como `inlineMath`, indistinguível de
 * uma fórmula inline pelo mdast sozinho.
 *
 * A fonte ainda sabe: o nó carrega `position.start.offset`, e o trecho que o
 * originou começa com `$$` ou com `$`.
 *
 * ⚠️ `fonteParseada` tem que ser a MESMA string que foi entregue ao parser —
 * a já neutralizada pelo `neutralizarReal`, não o markdown original. Os
 * offsets são relativos a ela. Reordenar o pipeline desalinha isto em
 * silêncio: as fórmulas param de virar display, sem erro nenhum.
 */
export function restaurarDisplay(arvore: any, fonteParseada: string): void {
  visitar(arvore, (no: any) => {
    if (no.type !== 'inlineMath') return;

    const inicio = no.position?.start?.offset;
    if (typeof inicio !== 'number') return;

    if (fonteParseada.startsWith('$$', inicio)) {
      no.data = { ...(no.data ?? {}), [EH_DISPLAY]: true };
    }
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/pre-transform/restaurar-display.spec.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Provar que o alinhamento de offset importa**

Acrescentar ao final do `describe`, como guarda contra a reordenação do pipeline:

```ts
  it('usa os offsets da fonte que foi parseada, não de outra', () => {
    // Se alguém reordenar o pipeline e passar o markdown ORIGINAL aqui
    // depois de o parser ter recebido o neutralizado, os offsets ficam
    // deslocados e o display some sem erro. Este teste fixa o contrato.
    const md = '$$b^2$$';
    const arvore = parse(md);
    restaurarDisplay(arvore, 'xx' + md); // fonte deslocada de propósito

    const achados: boolean[] = [];
    visitar(arvore, (no: any) => {
      if (no.type === 'inlineMath') achados.push(no.data?.[EH_DISPLAY] === true);
    });
    expect(achados).toEqual([false]);
  });
```

Rodar de novo: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/caderno/markdown/pre-transform/restaurar-display.ts src/modules/caderno/markdown/pre-transform/restaurar-display.spec.ts
git commit -m "feat(caderno): restaurar display math pelo offset da fonte

Medido: \$\$formula\$\$ do editor nunca vira no display, porque o
remark-math so produz display com delimitador em linha propria e o
editor grava tudo numa linha. A distincao se perde no parser e so a
fonte ainda sabe.

Teste fixa que a fonte tem que ser a mesma entregue ao parser: passar
outra desalinha os offsets e o display some sem erro."
```

---

### Task 6: `agruparHtml`

**Files:**
- Create: `src/modules/caderno/markdown/pre-transform/agrupar-html.ts`
- Create: `src/modules/caderno/markdown/pre-transform/agrupar-html.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/pre-transform/agrupar-html.spec.ts`:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { agruparHtml, NO_ALINHADO } from './agrupar-html';

const parse = (md: string): any =>
  unified().use(remarkParse).use(remarkGfm).parse(md);

const ALINHADO_CENTRO = '<div style="text-align: center">';

describe('agruparHtml', () => {
  it('envolve os irmãos entre a abertura e o fechamento', () => {
    // O remark-parse não parseia HTML: a abertura e o fechamento viram dois
    // nós `html` IRMÃOS, com o conteúdo entre eles como nós normais. Não há
    // aninhamento nenhum — é isso que faz o alinhamento sumir se ninguém
    // tratar.
    const arvore = parse(`${ALINHADO_CENTRO}\n\numa\n\noutra\n\n</div>`);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'html',
      'paragraph',
      'paragraph',
      'html',
    ]);

    agruparHtml(arvore);

    expect(arvore.children.map((n: any) => n.type)).toEqual([NO_ALINHADO]);
    expect(arvore.children[0].align).toBe('center');
    expect(arvore.children[0].children.map((n: any) => n.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });

  it('reconhece right e justify', () => {
    for (const alinhamento of ['right', 'justify']) {
      const arvore = parse(
        `<div style="text-align: ${alinhamento}">\n\ntexto\n\n</div>`,
      );
      agruparHtml(arvore);
      expect(arvore.children[0].align).toBe(alinhamento);
    }
  });

  it('deixa o resto do documento em paz', () => {
    const arvore = parse(`antes\n\n${ALINHADO_CENTRO}\n\nmeio\n\n</div>\n\ndepois`);
    agruparHtml(arvore);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'paragraph',
      NO_ALINHADO,
      'paragraph',
    ]);
  });

  it('não agrupa quando falta o fechamento', () => {
    // Sem par, deixa como está: o handler de `html` emite aviso.
    const arvore = parse(`${ALINHADO_CENTRO}\n\nsozinha`);
    agruparHtml(arvore);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'html',
      'paragraph',
    ]);
  });

  it('não mexe em documento sem HTML', () => {
    const arvore = parse('só texto\n\ne mais texto');
    agruparHtml(arvore);
    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/pre-transform/agrupar-html.spec.ts
```

Esperado: FAIL — `Cannot find module './agrupar-html'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/markdown/pre-transform/agrupar-html.ts`:

```ts
/** Tipo do nó sintético que o compiler traduz para `center`/`flushright`. */
export const NO_ALINHADO = 'cadernoAlinhado';

/**
 * O `remark-parse` não parseia HTML. Um bloco assim, que é o que o editor
 * grava para texto alinhado:
 *
 *     <div style="text-align: center">
 *
 *     conteúdo
 *
 *     </div>
 *
 * vira TRÊS nós IRMÃOS — `html`, `paragraph`, `html` — sem aninhamento
 * nenhum. Todo projeto tropeça nisso: se ninguém casar a abertura com o
 * fechamento, o alinhamento some e o conteúdo sai solto.
 *
 * Este passe casa os pares e envolve os irmãos num nó sintético.
 *
 * O caso de UMA linha só — `<div style="...">​<img ...></div>`, que é como o
 * editor grava imagem alinhada — não passa por aqui: vira um único nó `html`
 * e quem trata é o handler de `html`, com parse5.
 *
 * Faz a própria recursão em vez de usar o `visitar`, porque altera o array de
 * filhos durante a caminhada.
 */
const ABERTURA =
  /^<div\s+style\s*=\s*["']?\s*text-align:\s*(left|center|right|justify)\s*;?\s*["']?\s*>$/i;

const FECHAMENTO = /^<\/div>$/i;

export function agruparHtml(no: any): void {
  const filhos = no?.children;
  if (!Array.isArray(filhos)) return;

  for (let i = 0; i < filhos.length; i++) {
    const abre =
      filhos[i]?.type === 'html'
        ? ABERTURA.exec(String(filhos[i].value).trim())
        : null;

    if (!abre) {
      agruparHtml(filhos[i]);
      continue;
    }

    const fecha = filhos.findIndex(
      (n: any, j: number) =>
        j > i && n?.type === 'html' && FECHAMENTO.test(String(n.value).trim()),
    );

    // Sem par: deixa como está e segue. O handler de `html` avisa.
    if (fecha === -1) continue;

    const dentro = filhos.slice(i + 1, fecha);
    dentro.forEach(agruparHtml);

    filhos.splice(i, fecha - i + 1, {
      type: NO_ALINHADO,
      align: abre[1].toLowerCase(),
      children: dentro,
    });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/pre-transform/agrupar-html.spec.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/markdown/pre-transform/agrupar-html.ts src/modules/caderno/markdown/pre-transform/agrupar-html.spec.ts
git commit -m "feat(caderno): casar o HTML de alinhamento fatiado em irmaos

O remark-parse nao parseia HTML: abertura e fechamento viram dois nos
html IRMAOS, com o conteudo entre eles como nos normais. Sem casar os
pares o alinhamento some e o conteudo sai solto.

Sem par, deixa como esta -- quem avisa e o handler de html."
```

---

### Task 7: Handlers de texto e blocos simples

**Files:**
- Create: `src/modules/caderno/markdown/handlers.ts`
- Create: `src/modules/caderno/markdown/handlers.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/handlers.spec.ts`:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { compilar, Contexto } from './handlers';

const parse = (md: string): any =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(md);

function contexto(): Contexto {
  return {
    resolveAsset: (key: string) => `assets/${key}.png`,
    assets: [],
    avisos: [],
  };
}

/** Compila sem pré-transformação — os handlers isolados. */
function tex(md: string, ctx: Contexto = contexto()): string {
  return compilar(parse(md), ctx).trim();
}

describe('handlers — texto e marcas', () => {
  it('escapa o texto do parágrafo', () => {
    expect(tex('100% dos casos & mais')).toBe('100\\% dos casos \\& mais');
  });

  it('traduz negrito, itálico, tachado e código inline', () => {
    expect(tex('**forte**')).toBe('\\textbf{forte}');
    expect(tex('*enfase*')).toBe('\\emph{enfase}');
    expect(tex('~~fora~~')).toBe('\\sout{fora}');
    expect(tex('`codigo`')).toBe('\\texttt{codigo}');
  });

  it('escapa dentro das marcas também', () => {
    expect(tex('**100%**')).toBe('\\textbf{100\\%}');
  });
});

describe('handlers — blocos', () => {
  it('rebaixa heading para negrito, porque o caderno tem hierarquia própria', () => {
    expect(tex('# Titulo')).toBe('\\textbf{Titulo}\\par');
    expect(tex('###### Menor')).toBe('\\textbf{Menor}\\par');
  });

  it('traduz lista não ordenada', () => {
    expect(tex('- um\n- dois')).toBe(
      '\\begin{itemize}[nosep]\n\\item um\n\\item dois\n\\end{itemize}',
    );
  });

  it('traduz lista ordenada', () => {
    expect(tex('1. um\n2. dois')).toBe(
      '\\begin{enumerate}[nosep]\n\\item um\n\\item dois\n\\end{enumerate}',
    );
  });

  it('traduz citação', () => {
    expect(tex('> citado')).toBe('\\begin{quote}\ncitado\n\\end{quote}');
  });

  it('separa parágrafos com linha em branco', () => {
    expect(tex('um\n\ndois')).toBe('um\n\ndois');
  });

  it('traduz quebra de linha forçada', () => {
    expect(tex('um  \ndois')).toBe('um\\\\\ndois');
  });

  it('traduz régua horizontal', () => {
    expect(tex('---')).toBe('\\par\\noindent\\hrulefill\\par');
  });

  it('mantém o texto do link e descarta a URL', () => {
    // Caderno é papel: URL clicável não serve pra nada, e a maioria dos
    // links do acervo é ruído de colagem.
    expect(tex('veja [o site](https://exemplo.com)')).toBe('veja o site');
  });
});

describe('handlers — bloco de código', () => {
  it('usa verbatim', () => {
    expect(tex('```\nx = 1\n```')).toBe(
      '\\begin{verbatim}\nx = 1\n\\end{verbatim}',
    );
  });

  it('neutraliza \\end{verbatim} dentro do bloco', () => {
    // Nada é escapado dentro do verbatim, então um \end{verbatim} no
    // conteúdo fecharia o ambiente no meio e o resto do caderno viraria
    // código.
    const saida = tex('```\nantes\n\\end{verbatim}\ndepois\n```');
    expect(saida.match(/\\end\{verbatim\}/g)).toHaveLength(1);
    expect(saida).toContain('antes');
    expect(saida).toContain('depois');
  });
});

describe('handlers — degradação', () => {
  it('nó desconhecido vira texto e gera aviso, sem lançar', () => {
    const ctx = contexto();
    const arvore = parse('texto');
    arvore.children.push({ type: 'construcaoInventada', value: 'seja o que for' });

    expect(() => compilar(arvore, ctx)).not.toThrow();
    expect(ctx.avisos).toHaveLength(1);
    expect(ctx.avisos[0]).toContain('construcaoInventada');
  });

  it('árvore vazia devolve string vazia', () => {
    expect(tex('')).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/handlers.spec.ts
```

Esperado: FAIL — `Cannot find module './handlers'`.

- [ ] **Step 3: Implementar o dispatcher e os handlers de texto e bloco**

Criar `src/modules/caderno/markdown/handlers.ts`:

```ts
import { escapeLatex } from './escape-latex';
import { MARCADOR_REAL } from './pre-transform/neutralizar-real';

export interface Contexto {
  /** key `asset://` → caminho relativo dentro do zip. */
  resolveAsset: (key: string) => string;
  /** Keys encontradas, na ordem de aparição. Preenchido durante a compilação. */
  assets: string[];
  /** O que a pessoa precisa conferir na questão. Sem contexto de questão: quem
   *  sabe o número é o card 03, e é ele que prefixa. */
  avisos: string[];
}

type Handler = (no: any, ctx: Contexto) => string;

/** Compila os filhos e junta com um separador. */
const filhos = (no: any, ctx: Contexto, sep = ''): string =>
  (no.children ?? []).map((f: any) => compilarNo(f, ctx)).join(sep);

const HANDLERS: Record<string, Handler> = {
  root: (no, ctx) => filhos(no, ctx, '\n\n'),

  paragraph: (no, ctx) => filhos(no, ctx),

  // Devolve o marcador do `neutralizarReal` como `R\$`.
  text: (no) =>
    escapeLatex(String(no.value ?? '')).split(MARCADOR_REAL).join('R\\$'),

  strong: (no, ctx) => `\\textbf{${filhos(no, ctx)}}`,
  emphasis: (no, ctx) => `\\emph{${filhos(no, ctx)}}`,
  delete: (no, ctx) => `\\sout{${filhos(no, ctx)}}`,
  inlineCode: (no) => `\\texttt{${escapeLatex(no.value)}}`,

  // Rebaixado: o caderno já tem hierarquia própria (a numeração da questão).
  heading: (no, ctx) => `\\textbf{${filhos(no, ctx)}}\\par`,

  list: (no, ctx) => {
    const ambiente = no.ordered ? 'enumerate' : 'itemize';
    return `\\begin{${ambiente}}[nosep]\n${filhos(no, ctx, '\n')}\n\\end{${ambiente}}`;
  },

  listItem: (no, ctx) => `\\item ${filhos(no, ctx).trim()}`,

  blockquote: (no, ctx) =>
    `\\begin{quote}\n${filhos(no, ctx, '\n\n')}\n\\end{quote}`,

  // Caderno é papel: a URL não serve pra nada, e a maioria dos links do
  // acervo é ruído de colagem. Fica o texto.
  link: (no, ctx) => filhos(no, ctx),

  break: () => '\\\\\n',

  thematicBreak: () => '\\par\\noindent\\hrulefill\\par',

  code: (no) => {
    // Nada é escapado dentro do verbatim, então um \end{verbatim} no
    // conteúdo fecharia o ambiente no meio e o resto do caderno viraria
    // código. Quebrar a sequência resolve sem alterar o que se lê.
    const conteudo = String(no.value ?? '').replace(
      /\\end\{verbatim\}/g,
      '\\end {verbatim}',
    );
    return `\\begin{verbatim}\n${conteudo}\n\\end{verbatim}`;
  },
};

function compilarNo(no: any, ctx: Contexto): string {
  const handler = HANDLERS[no?.type];
  if (handler) return handler(no, ctx);

  // Nunca lança: uma construção exótica não pode derrubar um caderno de 90
  // questões. Emite o que dá pra ler e registra o que conferir.
  ctx.avisos.push(
    `construção não suportada (${no?.type}) — o conteúdo saiu como texto simples`,
  );
  return escapeLatex(textoCru(no));
}

/** Texto de qualquer nó, para o fallback. */
function textoCru(no: any): string {
  if (typeof no?.value === 'string') return no.value;
  if (Array.isArray(no?.children)) return no.children.map(textoCru).join('');
  return '';
}

export function compilar(arvore: any, ctx: Contexto): string {
  return compilarNo(arvore, ctx);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/handlers.spec.ts
```

Esperado: PASS, os testes de texto, blocos, código e degradação. Os de tabela, imagem, math e HTML ainda não existem — entram na Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/markdown/handlers.ts src/modules/caderno/markdown/handlers.spec.ts
git commit -m "feat(caderno): dispatcher e handlers de texto e bloco

No desconhecido nunca lanca: vira texto escapado mais um aviso. Um
markdown exotico nao pode derrubar um caderno de 90 questoes.

O verbatim neutraliza \\end{verbatim} no conteudo, senao o ambiente
fecharia no meio e o resto do caderno viraria codigo."
```

---

### Task 8: Handlers de tabela, imagem, matemática e HTML

**Files:**
- Modify: `src/modules/caderno/markdown/handlers.ts`
- Modify: `src/modules/caderno/markdown/handlers.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/modules/caderno/markdown/handlers.spec.ts`:

```ts
import { EH_DISPLAY } from './pre-transform/restaurar-display';
import { NO_ALINHADO } from './pre-transform/agrupar-html';

describe('handlers — tabela', () => {
  it('traduz tabela GFM respeitando os alinhamentos', () => {
    const saida = tex(
      '| esq | centro | dir |\n|:---|:---:|---:|\n| a | b | c |',
    );
    expect(saida).toContain(
      '\\begin{tabularx}{\\linewidth}{@{}' +
        '>{\\raggedright\\arraybackslash}X' +
        '>{\\centering\\arraybackslash}X' +
        '>{\\raggedleft\\arraybackslash}X@{}}',
    );
    expect(saida).toContain('\\toprule');
    expect(saida).toContain('esq & centro & dir \\\\');
    expect(saida).toContain('\\midrule');
    expect(saida).toContain('a & b & c \\\\');
    expect(saida).toContain('\\bottomrule');
    expect(saida).toContain('\\end{tabularx}');
  });

  it('usa X puro para coluna sem alinhamento declarado', () => {
    const saida = tex('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(saida).toContain('{@{}XX@{}}');
  });

  it('sempre produz ao menos uma coluna X', () => {
    // O tabularx aborta com "No suitable X-column found" se nenhuma coluna
    // for X. Uma tabela toda alinhada explicitamente cairia nisso se o
    // alinhamento virasse l/c/r.
    const saida = tex('| a | b |\n|:---|---:|\n| 1 | 2 |');
    expect(saida).toMatch(/\\begin\{tabularx\}[^\n]*X/);
  });

  it('escapa o conteúdo das células', () => {
    expect(tex('| a |\n|---|\n| 50% |')).toContain('50\\%');
  });
});

describe('handlers — imagem', () => {
  it('traduz imagem markdown e registra o asset', () => {
    const ctx = contexto();
    const saida = tex('![alt](asset://abc)', ctx);
    expect(saida).toContain(
      '\\includegraphics[max width=\\linewidth]{assets/abc.png}',
    );
    expect(ctx.assets).toEqual(['abc']);
  });

  it('traduz imagem em HTML e respeita a largura do editor', () => {
    // O editor grava <img> quando a imagem tem width/height ou alinhamento.
    // Tem que produzir o mesmo comando da imagem markdown, com a largura.
    const ctx = contexto();
    const saida = tex('<img src="asset://abc" alt="x" width="320" />', ctx);
    expect(saida).toContain('{assets/abc.png}');
    expect(saida).toContain('max width=\\linewidth');
    expect(saida).toContain('width=320pt');
    expect(ctx.assets).toEqual(['abc']);
  });

  it('imagem HTML sem width usa só o max width', () => {
    const saida = tex('<img src="asset://abc" alt="x" />');
    expect(saida).toBe('\\includegraphics[max width=\\linewidth]{assets/abc.png}');
  });

  it('avisa e não some quando o asset é desconhecido', () => {
    const ctx: Contexto = { ...contexto(), resolveAsset: () => '' };
    const saida = tex('![](asset://sumida)', ctx);
    expect(saida).toContain('imagem indisponível');
    expect(ctx.avisos.join(' ')).toContain('sumida');
  });
});

describe('handlers — matemática', () => {
  it('passa o conteúdo da fórmula sem tocar', () => {
    expect(tex('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
    expect(tex('$x^2 + y^2$')).toBe('$x^2 + y^2$');
  });

  it('emite display quando o nó está marcado', () => {
    const arvore = parse('$$b^2$$');
    const no = arvore.children[0].children[0];
    no.data = { [EH_DISPLAY]: true };
    expect(compilar(arvore, contexto()).trim()).toBe('\\[b^2\\]');
  });

  it('barra comando de arquivo e deixa visível, com aviso', () => {
    const ctx = contexto();
    const saida = tex('$\\input{/etc/passwd}$', ctx);
    expect(saida).not.toContain('\\input{/etc/passwd}');
    expect(saida).toContain('fórmula bloqueada');
    expect(ctx.avisos.join(' ')).toContain('\\input');
  });
});

describe('handlers — alinhamento', () => {
  it('traduz o nó agrupado para o ambiente certo', () => {
    const ctx = contexto();
    const arvore = {
      type: 'root',
      children: [
        {
          type: NO_ALINHADO,
          align: 'center',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: 'meio' }] }],
        },
      ],
    };
    expect(compilar(arvore, ctx).trim()).toBe(
      '\\begin{center}\nmeio\n\\end{center}',
    );
  });

  it('left não gera ambiente nenhum', () => {
    const arvore = {
      type: 'root',
      children: [
        {
          type: NO_ALINHADO,
          align: 'left',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: 'esq' }] }],
        },
      ],
    };
    expect(compilar(arvore, contexto()).trim()).toBe('esq');
  });

  it('html solto vira aviso e não vaza pro .tex', () => {
    const ctx = contexto();
    const saida = tex('<div style="text-align: center">', ctx);
    expect(saida).not.toContain('<div');
    expect(ctx.avisos.join(' ')).toContain('HTML');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/handlers.spec.ts
```

Esperado: os novos `describe` falham; os da Task 7 continuam passando.

- [ ] **Step 3: Implementar os handlers restantes**

Acrescentar a `src/modules/caderno/markdown/handlers.ts`, depois da definição de `HANDLERS` e antes de `compilarNo` (os `import` vão para o topo do arquivo):

```ts
import { comandoBarrado } from './sanitizar-math';
import { EH_DISPLAY } from './pre-transform/restaurar-display';
import { NO_ALINHADO } from './pre-transform/agrupar-html';

const AMBIENTE_POR_ALINHAMENTO: Record<string, string | null> = {
  left: null, // padrão do documento: não gera ambiente
  center: 'center',
  right: 'flushright',
  justify: null,
};

/**
 * `align` do nó GFM → especificação de coluna do tabularx.
 *
 * ⚠️ Todas são `X`, nunca `l`/`c`/`r`. O `tabularx` **exige pelo menos uma
 * coluna X** — sem nenhuma ele aborta com "No suitable X-column found", e uma
 * tabela toda alinhada explicitamente não teria X nenhum. O prefixo
 * `>{...\arraybackslash}` dá o alinhamento sem abrir mão do X, então a tabela
 * preenche a `\linewidth` e quebra o texto das células.
 */
const COLUNA_POR_ALINHAMENTO: Record<string, string> = {
  left: '>{\\raggedright\\arraybackslash}X',
  center: '>{\\centering\\arraybackslash}X',
  right: '>{\\raggedleft\\arraybackslash}X',
};

Object.assign(HANDLERS, {
  table: (no: any, ctx: Contexto) => {
    // Coluna sem alinhamento declarado vira X: é ela que absorve a largura e
    // quebra o texto. Sem nenhum X a tabela não preenche a \linewidth.
    const colunas: string[] = (no.align ?? []).map(
      (a: string | null) => COLUNA_POR_ALINHAMENTO[a ?? ''] ?? 'X',
    );

    const linhas: any[] = no.children ?? [];
    const linhaTex = (linha: any) =>
      (linha.children ?? [])
        .map((celula: any) => filhos(celula, ctx))
        .join(' & ') + ' \\\\';

    const [cabecalho, ...corpo] = linhas;

    return [
      `\\begin{tabularx}{\\linewidth}{@{}${colunas.join('')}@{}}`,
      '\\toprule',
      cabecalho ? linhaTex(cabecalho) : '',
      '\\midrule',
      ...corpo.map(linhaTex),
      '\\bottomrule',
      '\\end{tabularx}',
    ]
      .filter((l) => l !== '')
      .join('\n');
  },

  tableRow: (no: any, ctx: Contexto) => filhos(no, ctx, ' & '),
  tableCell: (no: any, ctx: Contexto) => filhos(no, ctx),

  image: (no: any, ctx: Contexto) => imagem(String(no.url ?? ''), ctx),

  inlineMath: (no: any, ctx: Contexto) => matematica(no, ctx),
  math: (no: any, ctx: Contexto) => matematica(no, ctx, true),

  [NO_ALINHADO]: (no: any, ctx: Contexto) => {
    const ambiente = AMBIENTE_POR_ALINHAMENTO[no.align] ?? null;
    const dentro = filhos(no, ctx, '\n\n');
    return ambiente
      ? `\\begin{${ambiente}}\n${dentro}\n\\end{${ambiente}}`
      : dentro;
  },

  // HTML que sobrou solto: ou é uma tag que o agruparHtml não casou, ou é
  // algo fora do subset. Nunca vaza pro .tex — LaTeX não entende HTML.
  html: (no: any, ctx: Contexto) => {
    const bruto = String(no.value ?? '').trim();
    const embutida = IMG_HTML.exec(bruto);
    if (embutida) return imagem(embutida[1], ctx, embutida[2]);

    ctx.avisos.push(
      `HTML não suportado no conteúdo (${bruto.slice(0, 40)}) — foi descartado`,
    );
    return '';
  },
});

/** `<img src="asset://KEY" width="320">`, com ou sem os outros atributos. */
const IMG_HTML = /<img[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*?(?:\bwidth\s*=\s*["']?(\d+))?[^>]*>/i;

function imagem(url: string, ctx: Contexto, largura?: string): string {
  const key = url.replace(/^asset:\/\//, '');
  const caminho = ctx.resolveAsset(key);

  if (!caminho) {
    ctx.avisos.push(
      `imagem não encontrada (${key}) — saiu um marcador no lugar`,
    );
    return '\\textbf{[imagem indisponível]}';
  }

  if (!ctx.assets.includes(key)) ctx.assets.push(key);

  // A largura do editor é sugestão, não imposição: o `max width` garante que
  // nunca estoure a coluna, que em duas colunas tem ~8 cm.
  const opcoes = largura
    ? `[max width=\\linewidth,width=${largura}pt]`
    : '[max width=\\linewidth]';

  return `\\includegraphics${opcoes}{${caminho}}`;
}

function matematica(no: any, ctx: Contexto, display = false): string {
  const formula = String(no.value ?? '');
  const barrado = comandoBarrado(formula);

  if (barrado) {
    ctx.avisos.push(
      `fórmula bloqueada por conter ${barrado}, que pode ler arquivos da máquina de quem compilar — reescreva a fórmula sem esse comando`,
    );
    return `\\textbf{[fórmula bloqueada: ${escapeLatex(barrado)}]}`;
  }

  // Conteúdo passa sem tocar; só o delimitador é normalizado. `\[…\]` em vez
  // de `$$…$$` porque o `$$` passa por fora do tratamento do amsmath,
  // incluindo os controles de quebra que importam numa coluna estreita.
  const ehDisplay = display || no.data?.[EH_DISPLAY] === true;
  return ehDisplay ? `\\[${formula}\\]` : `$${formula}$`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/handlers.spec.ts
```

Esperado: PASS, toda a suíte do arquivo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/markdown/handlers.ts src/modules/caderno/markdown/handlers.spec.ts
git commit -m "feat(caderno): handlers de tabela, imagem, matematica e HTML

Formula barrada sai VISIVEL com aviso, nao sumida: quem for imprimir
precisa ver que ha algo errado ali.

Imagem sem asset resolvido idem -- marcador no lugar, nunca silencio.
HTML solto nunca vaza pro .tex: LaTeX nao entende HTML."
```

---

### Task 9: `markdownToLatex` e fixtures

**Files:**
- Create: `src/modules/caderno/markdown/markdown-to-latex.ts`
- Create: `src/modules/caderno/markdown/markdown-to-latex.spec.ts`
- Create: `src/modules/caderno/markdown/fixtures/*.md` e `*.tex`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/markdown/markdown-to-latex.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { markdownToLatex } from './markdown-to-latex';

const FIXTURES = path.join(__dirname, 'fixtures');

const converter = (md: string) =>
  markdownToLatex(md, { resolveAsset: (key) => `assets/${key}.png` });

describe('markdownToLatex — pipeline completo', () => {
  it('devolve vazio para entrada vazia, sem quebrar', () => {
    expect(converter('').latex).toBe('');
    expect(converter('').avisos).toEqual([]);
  });

  it('é síncrona — não devolve Promise', () => {
    // A stack do remark é ESM-only e a tentação é carregá-la com import()
    // dinâmico, o que tornaria tudo assíncrono e contaminaria o card 03.
    // O require(esm) do Node >= 20.19 evita isso.
    expect(converter('texto')).not.toBeInstanceOf(Promise);
  });

  it('preserva fórmula e neutraliza dinheiro no mesmo parágrafo', () => {
    const { latex } = converter('A resistência $R$ custa R$ 12,00.');
    expect(latex).toContain('$R$');
    expect(latex).toContain('R\\$ 12,00');
  });

  it('não deixa o R$ engolir a prosa entre dois valores', () => {
    const { latex } = converter('custa R$ 50,00 e outro R$ 30,00');
    expect(latex).toBe('custa R\\$ 50,00 e outro R\\$ 30,00');
  });

  it('restaura display math escrito inline', () => {
    expect(converter('$$\\int_0^1 x\\,dx$$').latex).toBe(
      '\\[\\int_0^1 x\\,dx\\]',
    );
  });

  it('agrupa o alinhamento em um único ambiente', () => {
    const { latex } = converter(
      '<div style="text-align: center">\n\numa\n\noutra\n\n</div>',
    );
    expect(latex.match(/\\begin\{center\}/g)).toHaveLength(1);
    expect(latex).toContain('uma');
    expect(latex).toContain('outra');
  });

  it('acumula os assets na ordem de aparição, sem repetir', () => {
    const { assets } = converter(
      '![](asset://a)\n\n![](asset://b)\n\n![](asset://a)',
    );
    expect(assets).toEqual(['a', 'b']);
  });
});

describe('fixtures', () => {
  const nomes = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));

  it('há fixtures para rodar', () => {
    expect(nomes.length).toBeGreaterThanOrEqual(13);
  });

  it.each(nomes)('%s', (nome) => {
    const entrada = fs.readFileSync(path.join(FIXTURES, `${nome}.md`), 'utf-8');
    const esperado = fs.readFileSync(
      path.join(FIXTURES, `${nome}.tex`),
      'utf-8',
    );
    expect(converter(entrada).latex.trim()).toBe(esperado.trim());
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/markdown-to-latex.spec.ts
```

Esperado: FAIL — `Cannot find module './markdown-to-latex'`.

- [ ] **Step 3: Implementar a entrada pública**

Criar `src/modules/caderno/markdown/markdown-to-latex.ts`:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { compilar, Contexto } from './handlers';
import { agruparHtml } from './pre-transform/agrupar-html';
import { neutralizarReal } from './pre-transform/neutralizar-real';
import { restaurarDisplay } from './pre-transform/restaurar-display';

export interface ConversaoResultado {
  latex: string;
  /** Keys `asset://` encontradas, na ordem de aparição, sem repetição. */
  assets: string[];
  /** O que a pessoa precisa conferir na questão. Sem o número da questão:
   *  quem sabe é o card 03, e é ele que prefixa. */
  avisos: string[];
}

/**
 * Converte o markdown de um campo de questão para LaTeX.
 *
 * O subset suportado não é markdown genérico: é o que o editor TipTap do
 * `client-vcnafacul` produz. A fonte da verdade do subset é
 * `client-vcnafacul/src/components/molecules/richTextEditor/useRichTextEditor.ts`
 * — e são DOIS serializers ali, com saídas diferentes.
 *
 * Nunca lança. Construção que o conversor não entende vira texto legível mais
 * um aviso: um markdown exótico não pode derrubar um caderno de 90 questões.
 *
 * Síncrona de propósito. A stack do remark é ESM-only, mas o `require(esm)` do
 * Node >= 20.19 permite carregá-la sem `import()` dinâmico — e isso preserva o
 * contrato de função pura do card 03.
 */
const PROCESSADOR = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function markdownToLatex(
  markdown: string,
  opts: { resolveAsset: (key: string) => string },
): ConversaoResultado {
  const ctx: Contexto = {
    resolveAsset: opts.resolveAsset,
    assets: [],
    avisos: [],
  };

  if (!markdown) return { latex: '', assets: [], avisos: [] };

  // 1. Antes do parser: o estrago do R$ acontece na tokenização.
  const fonte = neutralizarReal(markdown);

  // 2. Parse.
  const arvore: any = PROCESSADOR.parse(fonte);

  // 3. ⚠️ A fonte aqui tem que ser a NEUTRALIZADA, não o markdown original:
  //    os offsets do mdast são relativos ao que foi parseado. Trocar as duas
  //    faz o display sumir sem erro nenhum.
  restaurarDisplay(arvore, fonte);

  // 4. Casa a abertura e o fechamento do HTML de alinhamento.
  agruparHtml(arvore);

  return {
    latex: compilar(arvore, ctx).trim(),
    assets: ctx.assets,
    avisos: ctx.avisos,
  };
}
```

- [ ] **Step 4: Criar as fixtures**

Criar `src/modules/caderno/markdown/fixtures/`. Cada par é `<nome>.md` + `<nome>.tex`. Todas com a origem anotada no nome: `tm-` para o que o `tiptap-markdown` produz, `sd-` para o que o `serializeDocToMarkdown` manual produz — os dois formatos existem no acervo.

Crie exatamente estes treze pares, com este conteúdo:

`tm-texto-marcas.md`
```
Um **forte**, um *enfase*, um ~~fora~~ e um `codigo`.
```
`tm-texto-marcas.tex`
```
Um \textbf{forte}, um \emph{enfase}, um \sout{fora} e um \texttt{codigo}.
```

`tm-escape.md`
```
100% dos casos, a_b, #hashtag, C&A, a < b, a | b e {chaves}.
```
`tm-escape.tex`
```
100\% dos casos, a\_b, \#hashtag, C\&A, a \textless{} b, a \textbar{} b e \{chaves\}.
```

`tm-dinheiro-e-formula.md`
```
A resistência $R$ custa R$ 12,00 e a outra R$ 8,00.
```
`tm-dinheiro-e-formula.tex`
```
A resistência $R$ custa R\$ 12,00 e a outra R\$ 8,00.
```

`tm-math-inline.md`
```
A função $f(x) = x^2 - 4$ é par.
```
`tm-math-inline.tex`
```
A função $f(x) = x^2 - 4$ é par.
```

`sd-math-display.md`
```
$$\int_{0}^{1} x \, dx = \frac{1}{2}$$
```
`sd-math-display.tex`
```
\[\int_{0}^{1} x \, dx = \frac{1}{2}\]
```

`tm-math-barrada.md`
```
Considere $\input{/etc/passwd}$ na conta.
```
`tm-math-barrada.tex`
```
Considere \textbf{[fórmula bloqueada: \textbackslash{}input]} na conta.
```

`tm-listas.md`
```
- um
- dois

1. primeiro
2. segundo
```
`tm-listas.tex`
```
\begin{itemize}[nosep]
\item um
\item dois
\end{itemize}

\begin{enumerate}[nosep]
\item primeiro
\item segundo
\end{enumerate}
```

`tm-citacao-heading.md`
```
# Titulo rebaixado

> um trecho citado
```
`tm-citacao-heading.tex`
```
\textbf{Titulo rebaixado}\par

\begin{quote}
um trecho citado
\end{quote}
```

`tm-tabela.md`
```
| esquerda | centro | direita |
|:---------|:------:|--------:|
| a | b | c |
```
`tm-tabela.tex`
```
\begin{tabularx}{\linewidth}{@{}>{\raggedright\arraybackslash}X>{\centering\arraybackslash}X>{\raggedleft\arraybackslash}X@{}}
\toprule
esquerda & centro & direita \\
\midrule
a & b & c \\
\bottomrule
\end{tabularx}
```

`tm-imagem.md`
```
![grafico](asset://abc123)
```
`tm-imagem.tex`
```
\includegraphics[max width=\linewidth]{assets/abc123.png}
```

`tm-imagem-html.md`
```
<img src="asset://abc123" alt="grafico" width="320" />
```
`tm-imagem-html.tex`
```
\includegraphics[max width=\linewidth,width=320pt]{assets/abc123.png}
```

`sd-alinhamento.md`
```
<div style="text-align: center">

primeiro parágrafo

segundo parágrafo

</div>
```
`sd-alinhamento.tex`
```
\begin{center}
primeiro parágrafo

segundo parágrafo
\end{center}
```

`tm-verbatim.md`
````
```
antes
\end{verbatim}
depois
```
````
`tm-verbatim.tex`
```
\begin{verbatim}
antes
\end {verbatim}
depois
\end{verbatim}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/markdown/markdown-to-latex.spec.ts
```

Esperado: PASS. Se alguma fixture divergir, **confira qual dos dois está errado antes de ajustar** — a saída esperada é a que compila no template do card 01, não a que o código produz hoje.

- [ ] **Step 6: Rodar a suíte inteira do módulo e conferir cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='src/modules/caderno/markdown/**/*.ts' src/modules/caderno
```

Esperado: tudo verde, cobertura ≥ 90% em statements no diretório `markdown/`. Se ficar abaixo, o que falta são ramos de degradação — acrescente teste, não `istanbul ignore`.

- [ ] **Step 7: Lint**

```bash
npx prettier --write src/modules/caderno/markdown/markdown-to-latex.ts src/modules/caderno/markdown/markdown-to-latex.spec.ts
npx eslint src/modules/caderno/markdown/markdown-to-latex.ts src/modules/caderno/markdown/markdown-to-latex.spec.ts
```

⚠️ Sempre caminhos de arquivo, nunca um diretório: `npx eslint <dir>` reformata arquivos não relacionados neste repo.

- [ ] **Step 8: Commit**

```bash
git add src/modules/caderno/markdown/
git commit -m "feat(caderno): markdownToLatex, pipeline completo e fixtures

Ordem do pipeline importa: neutralizar R\$ ANTES do parser (o estrago e
na tokenizacao) e restaurar display com a fonte NEUTRALIZADA (os offsets
sao relativos a ela). Trocar as duas faz o display sumir sem erro.

13 fixtures, com a origem no nome: tm- pro que o tiptap-markdown produz,
sd- pro que o serializer manual produz. Os dois formatos existem no
acervo."
```

---

### Task 10: Gate manual — caderno de fixtures no Overleaf

**Files:** nenhum. Esta task não produz commit; ela **para e espera o retorno do usuário**.

O card pede que cada `expected.tex` compile dentro do template do card 01. Não há TeX na máquina, então isso vira uma rodada manual — a segunda da etapa. Como o card 01 ensinou que essa rodada é o recurso caro, o caderno já vai montado pra responder tudo numa passada.

- [ ] **Step 1: Gerar o `conteudo.tex` a partir das fixtures**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-simulado
OUT="${TMPDIR:-/tmp}/caderno-fixtures"
FIX=src/modules/caderno/markdown/fixtures
V=src/modules/caderno/templates/padrao/v1
rm -rf "$OUT" && mkdir -p "$OUT"

# Cada fixture vira uma questao numerada com o nome dela visivel acima, pra
# que o usuario saiba QUAL quebrou sem ter que cacar.
n=45
: > "$OUT/conteudo.tex"
for tex in "$FIX"/*.tex; do
  nome=$(basename "$tex" .tex)
  {
    printf '%% fixture: %s\n' "$nome"
    printf '\\needspace{6\\baselineskip}\n'
    printf '\\setcounter{question}{%d}\n' "$n"
    printf '\\question \\textbf{[%s]}\\par\n' "$nome"
    cat "$tex"
    printf '\n\\begin{choices}\n  \\CorrectChoice ok\n  \\choice nao\n\\end{choices}\n\n'
  } >> "$OUT/conteudo.tex"
  n=$((n+1))
done

cat > "$OUT/metadados.tex" <<'M'
\def\cadernoTitulo{Fixtures do conversor --- card 02}
\def\cadernoSubtitulo{uma questão por construção suportada}
M

cp "$V/main.tex" "$V/preambulo.tex" "$V/LEIA-ME.txt" "$OUT/"
cp src/modules/cartao-resposta/assets/logo.png "$OUT/"
# A fixture de imagem referencia assets/abc123.png; a logo serve de conteudo.
mkdir -p "$OUT/assets" && cp src/modules/cartao-resposta/assets/logo.png "$OUT/assets/abc123.png"

(cd "$OUT" && zip -qr ../caderno-fixtures.zip .)
echo "zip em: ${TMPDIR:-/tmp}/caderno-fixtures.zip"
grep -c '^\\question' "$OUT/conteudo.tex"
```

Esperado: o zip existe e o `grep` devolve 13 — uma questão por fixture.

- [ ] **Step 2: Entregar ao usuário**

Overleaf → *New Project* → *Upload Project* → enviar o zip → compilar `main.tex`.

- [ ] **Step 3: Checklist de conferência (o usuário responde)**

- [ ] Compila sem erro
- [ ] `tm-escape`: `a < b` sai como `a < b`, **não** como `a ¡ b` — é o teste dos quatro caracteres que o `escape-latex` não cobre
- [ ] `tm-dinheiro-e-formula`: o `$R$` sai em itálico matemático e os `R$ 12,00` saem como texto com cifrão
- [ ] `sd-math-display`: a integral sai **centralizada em display**, não espremida na linha
- [ ] `tm-math-barrada`: aparece a caixa "fórmula bloqueada", visível
- [ ] `tm-tabela`: três colunas, alinhamentos esquerda/centro/direita respeitados, cabendo na coluna
- [ ] `tm-imagem`: a imagem aparece e não estoura a coluna
- [ ] `tm-imagem-html`: sai igual à `tm-imagem`, com a largura do editor aplicada
- [ ] `sd-alinhamento`: os **dois** parágrafos ficam centralizados, dentro de um único bloco
- [ ] `tm-verbatim`: o bloco de código aparece inteiro, e o `\end {verbatim}` do meio sai como texto sem fechar o ambiente
- [ ] `tm-listas` e `tm-citacao-heading`: sem espaçamento estranho na coluna estreita

- [ ] **Step 4: Parar e aguardar**

Não seguir sem o retorno. Se algo não compilar, o log do Overleaf é o insumo: colar o trecho relevante, não só "deu erro".

---

### Task 11: Consolidar o resultado da compilação

**Files:** o que a compilação apontar, em `src/modules/caderno/markdown/`

- [ ] **Step 1: Corrigir o que a rodada revelou**

Cada ajuste mora num arquivo só: escape no `escape-latex.ts`, tabela/imagem/math no `handlers.ts`, os consertos de parser nas três pré-transformações. A fixture correspondente é atualizada junto — e o `.tex` esperado passa a ser o que **compila**, não o que o código produzia antes.

- [ ] **Step 2: Rodar a suíte inteira**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno
```

Esperado: tudo verde.

- [ ] **Step 3: Confirmar que o build e o empacotamento seguem íntegros**

```bash
yarn build && ls dist/main.js && find dist/modules/caderno -name '*.tex' | head -5 && rm -rf dist
```

Esperado: `dist/main.js` no lugar e os `.tex` do template do card 01 empacotados. As fixtures **não** precisam ir pro `dist` — são teste.

- [ ] **Step 4: Commit**

```bash
git add -A src/modules/caderno/
git commit -m "fix(caderno): ajustes do conversor apos a compilacao no Overleaf"
```

⚠️ `git add -A` **com o caminho**, nunca puro: já houve neste projeto um commit acidental de arquivo não rastreado do usuário.

- [ ] **Step 5: Abrir o PR contra a branch da POC**

```bash
git push -u origin feature/caderno-02-conversor-markdown
gh pr create --base poc/caderno-latex \
  --title "[Caderno LaTeX] Card 02 — conversor markdown → LaTeX" \
  --body "Card 02 da etapa Caderno LaTeX. Converte o markdown com LaTeX inline do editor de questoes para LaTeX encaixavel no template do card 01.

Tres pre-transformacoes consertam o que o parser erra, e so entao um compiler caminha o mdast com um handler por tipo de no.

Quatro achados medidos durante o desenho, tres contradizendo o card original:

- a stack do remark e ESM-only e o projeto e CommonJS. Funciona pelo require(esm) do Node 20.19 -- e por isso o conversor pode ser sincrono, sem contaminar o card 03
- o card afirmava que 'R\$ 50 costuma passar ileso'. Nao passa: dois R\$ no mesmo paragrafo fazem o texto entre eles virar formula
- \$\$formula\$\$ do editor nunca vira display: o remark-math so produz display com delimitador em linha propria
- a heuristica obvia do R\$ destroi \$R\$, que e formula legitima e comum

Barra oito comandos de arquivo dentro de formula: na fase 1 quem compila e o usuario, sem as protecoes que o card 08 planeja.

Validado manualmente no Overleaf (nao ha TeX na maquina de desenvolvimento).

Spec: docs/superpowers/specs/2026-09-07-caderno-conversor-markdown-latex-design.md
Plano: docs/superpowers/plans/2026-09-07-caderno-conversor-markdown-latex.md"
```

O `--base` é a POC, **não** a `develop`.

---

## Reflexos a propagar

| Card | O que muda |
|---|---|
| 03 | Recebe `markdownToLatex` **síncrona**; prefixa cada aviso com o número da questão; usa `escapeLatex` para o `\def\cadernoTitulo` |
| 03 | O `resolveAsset` recebe a key **sem** o prefixo `asset://` — o conversor já tira |
| 05 | Os avisos acumulados sobem para o `manifest.json` |
| 08 | O `sanitizar-math` é defesa em profundidade, **não** substitui `openin_any=p` nem `-no-shell-escape` |
| 01 | A fixture `exemplo/conteudo.tex` usa `$$…$$`; o gerador emite `\[…\]`. Vale alinhar quando alguém mexer nela |
