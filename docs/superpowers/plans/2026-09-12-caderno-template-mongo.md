# Caderno — Card 10: template versionado no Mongo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o layout do caderno do repositório e pôr no Mongo, versionado — para mudar a capa não exigir PR, review e deploy.

**Architecture:** Duas peças puras onde mora o risco (lint e extração de zip), testáveis sem Mongo e sem HTTP; um serviço com transação em cima delas; e um seed que passa pela própria régua.

**Tech Stack:** NestJS 10, Mongoose, `jszip` (já presente). **Uma dependência nova, de tipo: `@types/multer`.**

**Spec:** `docs/superpowers/specs/2026-09-12-caderno-template-mongo-design.md`

---

## Contexto que o plano assume

**A POC acabou.** Esta branch saiu da `develop` atualizada, que já tem o caderno inteiro nos três
repos.

**Este card muda uma decisão do card 00.** Lá a fonte da verdade do template era "o repo, e só ele";
passa a ser o Mongo, com o repo como seed.

⚠️ **Este card não muda a geração do zip.** Quem passa a montar o `main.tex` a partir do Mongo é o
card 11. Não é lacuna: sem os cards 12 e 13, ninguém alcança estes endpoints para publicar nada.

⚠️ **`GET /template/teste` é do card 11**, apesar de aparecer no fluxo do card 10. Não implemente.

## O que já foi verificado (não re-verifique)

| | |
|---|---|
| `BaseSchema` | `src/shared/base/base.schema.ts` |
| `BaseRepository` | `src/shared/base/base.repository.ts` — o padrão que o repositório novo segue |
| índice parcial único | precedente em `historico.schema.ts:63`, **com spec própria** em `historico.schema.spec.ts` — é o molde |
| `jszip` | já nas dependências, veio com o card 04 |
| multipart | `@nestjs/platform-express` presente, `multer` transitivo; falta `@types/multer` |
| o template atual | passa nas 8 regras do lint |

## Restrições do repo

- ⚠️ **Nunca** `yarn lint` nem `npx eslint <diretório>`: reformata arquivos não relacionados. Sempre caminhos explícitos.
- ⚠️ **Nunca** `git add -A` nem `git add .`.
- Jest: `npx jest --detectOpenHandles --forceExit <caminho>`. `rootDir` é `src`.
- ⚠️ `strictNullChecks: false` no tsconfig: use `x.ok === false`, não `!x.ok`.
- ⚠️ `scripts/` está no `exclude` do `tsconfig.build.json`. **Não mexa** — `.ts` fora de `src/` move o `dist/main.js` e quebra o PM2.
- Branch `feature/caderno-10-template-mongo`, já criada, **de `develop`**. Commits autônomos liberados.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/template/sem-comentarios.ts` | tira comentário LaTeX respeitando `\%`. **Puro.** |
| `src/modules/caderno/template/template-lint.ts` | 7 erros + 2 avisos. **Puro.** |
| `src/modules/caderno/template/extrair-zip.ts` | whitelist, limites, path traversal. **Puro.** |
| `src/modules/caderno/template/caderno-template.schema.ts` | a coleção e os três índices |
| `src/modules/caderno/template/caderno-template.repository.ts` | acesso, estendendo `BaseRepository` |
| `src/modules/caderno/template/caderno-template.service.ts` | rascunho, publicar, restaurar |
| `src/modules/caderno/template/caderno-template.controller.ts` | os sete endpoints |
| `src/modules/caderno/template/caderno-template.module.ts` | wiring |
| `scripts/seed-template-caderno.ts` | a versão 1 |

---

### Task 1: `sem-comentarios.ts` — a peça de que três regras dependem

**Files:**
- Create: `src/modules/caderno/template/sem-comentarios.spec.ts`
- Create: `src/modules/caderno/template/sem-comentarios.ts`

Vinte linhas, e é o ponto onde o lint erra nos dois sentidos.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/template/sem-comentarios.spec.ts`:

```ts
import { semComentarios } from './sem-comentarios';

describe('semComentarios — o que precisa sumir', () => {
  it('tira o comentário de linha inteira', () => {
    expect(semComentarios('% um comentário\n\\documentclass{exam}')).toBe(
      '\n\\documentclass{exam}',
    );
  });

  it('tira o comentário no fim da linha, preservando o código', () => {
    expect(semComentarios('\\input{preambulo} % carrega os pacotes')).toBe(
      '\\input{preambulo} ',
    );
  });

  it('o caso que motiva esta peça: comando dentro de comentário não conta', () => {
    // ⚠️ O `main.tex` de hoje TEM isto, na linha 16. Um `includes` ingênuo
    // conta duas ocorrências de `\input{preambulo}` e não distingue a real.
    //
    // E o caso perigoso é o inverso: alguém comenta `\input{conteudo}`
    // depurando no Overleaf e esquece. O lint passa, e a prova compila
    // perfeitamente — sem nenhuma questão.
    const texto = [
      '% \\input{preambulo} e \\includegraphics resolvem relativo a este',
      '\\input{preambulo}',
      '% \\input{conteudo}',
    ].join('\n');
    const limpo = semComentarios(texto);
    expect(limpo).toContain('\\input{preambulo}');
    expect(limpo).not.toContain('\\input{conteudo}');
  });
});

describe('semComentarios — o que NÃO pode sumir', () => {
  it('`\\%` escapado não inicia comentário', () => {
    // ⚠️ O outro sentido do erro. Engolir daqui em diante produz falso
    // positivo no lint, e o coordenador não consegue publicar um template
    // que ele acabou de ver compilar no Overleaf.
    expect(semComentarios('100\\% dos casos \\& mais')).toBe(
      '100\\% dos casos \\& mais',
    );
  });

  it('`\\%` seguido de um comentário de verdade na mesma linha', () => {
    expect(semComentarios('\\def\\x{50\\%} % a taxa')).toBe('\\def\\x{50\\%} ');
  });

  it('`\\\\%` — barra escapada, então o % É comentário', () => {
    // `\\` é quebra de linha; o `%` depois dela está solto.
    expect(semComentarios('a \\\\% comentário')).toBe('a \\\\');
  });

  it('preserva as quebras de linha', () => {
    // A pilha de `\begin`/`\end` reporta número de linha; comer as quebras
    // faria toda mensagem de erro apontar para a linha 1.
    expect(semComentarios('a\n% x\nb').split('\n')).toHaveLength(3);
  });

  it('texto sem % nenhum atravessa igual', () => {
    expect(semComentarios('\\documentclass{exam}')).toBe('\\documentclass{exam}');
  });

  it('string vazia devolve vazia', () => {
    expect(semComentarios('')).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/sem-comentarios.spec.ts
```

Esperado: FAIL — `Cannot find module './sem-comentarios'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/template/sem-comentarios.ts`:

```ts
/**
 * Remove comentários LaTeX de um texto, preservando as quebras de linha.
 *
 * ⚠️ **Três regras do lint dependem disto, e ele erra nos dois sentidos.**
 *
 * Não remover: um `\input{conteudo}` comentado passa no lint, e a prova
 * compila perfeitamente — **sem nenhuma questão**. É o caso realista: alguém
 * comenta a linha depurando no Overleaf e esquece de voltar. O `main.tex` do
 * repo já tem um `\input{preambulo}` dentro de comentário, na linha 16.
 *
 * Remover demais — ignorando o `\%` escapado — engole texto válido e produz
 * falso positivo que **bloqueia um template bom**, depois de o coordenador ter
 * visto o PDF compilar no Overleaf.
 *
 * ⚠️ As quebras de linha ficam: a pilha de `\begin`/`\end` reporta número de
 * linha, e comê-las faria toda mensagem apontar para a linha 1.
 */
export function semComentarios(texto: string): string {
  return (texto ?? '')
    .split('\n')
    .map(cortarComentario)
    .join('\n');
}

/**
 * Corta a partir do primeiro `%` que não está escapado.
 *
 * A contagem é de **barras consecutivas antes do `%`**: par significa que a
 * última é ela mesma escapada (`\\` é quebra de linha), então o `%` está
 * solto e é comentário. Ímpar significa que a barra escapa o `%`.
 */
function cortarComentario(linha: string): string {
  for (let i = 0; i < linha.length; i += 1) {
    if (linha[i] !== '%') continue;

    let barras = 0;
    for (let j = i - 1; j >= 0 && linha[j] === '\\'; j -= 1) barras += 1;

    if (barras % 2 === 0) return linha.slice(0, i);
  }
  return linha;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/sem-comentarios.spec.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Provar que a paridade morde**

Troque a contagem de barras por `linha[i - 1] === '\\'` — a checagem ingênua de "a anterior é barra".
Confirme que **`\\%` — barra escapada, então o % É comentário** fica vermelho. Restaure.

⚠️ Se não morder, **reporte**. Já aconteceu duas vezes nesta etapa: um fixture fraco demais para
distinguir o certo do errado.

- [ ] **Step 6: Provar contra o arquivo real**

```bash
npx ts-node -T --compiler-options '{"module":"commonjs"}' -e "
const fs=require('fs');
const {semComentarios}=require('./src/modules/caderno/template/sem-comentarios');
const t=fs.readFileSync('src/modules/caderno/templates/v1/main.tex','utf-8');
const l=semComentarios(t);
console.log('cru    — input{preambulo}:', (t.match(/input\{preambulo\}/g)||[]).length);
console.log('limpo  — input{preambulo}:', (l.match(/input\{preambulo\}/g)||[]).length, '<- precisa ser 1');
console.log('linhas preservadas:', t.split('\n').length === l.split('\n').length);
"
```

Esperado: cru **2**, limpo **1**, linhas preservadas. É a prova de que a peça faz o que motiva sua
existência.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/modules/caderno/template/sem-comentarios.ts src/modules/caderno/template/sem-comentarios.spec.ts
npx eslint src/modules/caderno/template/sem-comentarios.ts src/modules/caderno/template/sem-comentarios.spec.ts
git add src/modules/caderno/template/sem-comentarios.ts src/modules/caderno/template/sem-comentarios.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): remover comentario LaTeX respeitando o escape

Tres regras do lint dependem disto, e ele erra nos dois sentidos.

Nao remover: um `\input{conteudo}` comentado passa no lint e a prova
compila perfeitamente SEM NENHUMA QUESTAO. E o caso realista -- alguem
comenta depurando no Overleaf e esquece. O main.tex do repo ja tem um
`\input{preambulo}` em comentario, na linha 16 (medido: cru conta 2
ocorrencias, limpo conta 1).

Remover demais, ignorando o `\%`, bloqueia template bom depois de o
coordenador ter visto o PDF compilar.

A paridade de barras e o que separa os dois: `\%` e escape, `\\%` e
quebra de linha seguida de comentario.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 2: `template-lint.ts` — sete que bloqueiam, duas que avisam

**Files:**
- Create: `src/modules/caderno/template/template-lint.spec.ts`
- Create: `src/modules/caderno/template/template-lint.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/template/template-lint.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { lintarTemplate } from './template-lint';

/** Um template mínimo que passa em tudo. Cada teste quebra UMA coisa. */
const OK = {
  'main.tex': [
    '\\documentclass[11pt,a4paper,twocolumn]{exam}',
    '\\input{preambulo}',
    '\\input{metadados}',
    '\\begin{document}',
    '\\begin{questions}',
    '\\input{conteudo}',
    '\\end{questions}',
    '\\end{document}',
  ].join('\n'),
  'preambulo.tex': '\\usepackage[T1]{fontenc}',
};

const semA = (linha: string) => ({
  ...OK,
  'main.tex': OK['main.tex']
    .split('\n')
    .filter((l) => !l.includes(linha))
    .join('\n'),
});

describe('lintarTemplate — o feliz', () => {
  it('o template mínimo passa, sem erro e sem aviso', () => {
    const r = lintarTemplate(OK);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.podePublicar).toBe(true);
  });

  it('o template REAL do repo passa', () => {
    // ⚠️ Se o seed reprova na própria régua, o card se contradiz.
    const dir = path.join(__dirname, '../templates/v1');
    const r = lintarTemplate({
      'main.tex': fs.readFileSync(path.join(dir, 'main.tex'), 'utf-8'),
      'preambulo.tex': fs.readFileSync(path.join(dir, 'preambulo.tex'), 'utf-8'),
    });
    expect(r.erros).toEqual([]);
    expect(r.podePublicar).toBe(true);
  });
});

describe('lintarTemplate — as sete que bloqueiam', () => {
  it.each([
    ['\\documentclass', 'documentclass'],
    ['\\begin{document}', 'begin{document}'],
    ['\\end{document}', 'end{document}'],
    ['\\input{preambulo}', 'input{preambulo}'],
    ['\\input{conteudo}', 'input{conteudo}'],
    ['\\input{metadados}', 'input{metadados}'],
    ['\\begin{questions}', 'begin{questions}'],
    ['\\end{questions}', 'end{questions}'],
  ])('faltando %s → erro que nomeia a regra', (_rotulo, trecho) => {
    const r = lintarTemplate(semA(trecho));
    expect(r.podePublicar).toBe(false);
    expect(r.erros.join(' ')).toContain(trecho);
  });

  it('O CASO PERIGOSO: \\input{conteudo} só dentro de comentário → erro', () => {
    // Sem esta regra, a prova compila perfeitamente e sai vazia. É o motivo
    // de a peça `semComentarios` existir.
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'].replace(
        '\\input{conteudo}',
        '% \\input{conteudo}',
      ),
    });
    expect(r.podePublicar).toBe(false);
    expect(r.erros.join(' ')).toContain('conteudo');
  });

  it('\\begin sem \\end → erro de balanceamento', () => {
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'].replace('\\end{questions}', ''),
    });
    expect(r.podePublicar).toBe(false);
  });

  it('\\end sem \\begin correspondente → erro', () => {
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'] + '\n\\end{center}',
    });
    expect(r.podePublicar).toBe(false);
  });

  it.each([
    ['\\write18{rm -rf /}'],
    ['\\openin1=/etc/passwd'],
    ['\\usepackage{shellesc}'],
    ['\\input{/etc/passwd}'],
    ['\\input{../segredo}'],
    ['\\include{../../x}'],
  ])('proibido: %s', (perigoso) => {
    const r = lintarTemplate({ ...OK, 'preambulo.tex': perigoso });
    expect(r.podePublicar).toBe(false);
  });

  it('\\input{sub/arquivo} NÃO é erro', () => {
    // ⚠️ A regra é sobre SAIR do diretório, não sobre ter barra. Um
    // subcaminho relativo não sai — ele só não existe no zip, e a falha
    // aparece na compilação, visível.
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '\\input{sub/arquivo}' });
    expect(r.podePublicar).toBe(true);
  });

  it('o proibido dentro de comentário NÃO é erro', () => {
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '% \\write18{ls}' });
    expect(r.podePublicar).toBe(true);
  });
});

describe('lintarTemplate — as duas que avisam', () => {
  it('chave desbalanceada AVISA, e deixa publicar', () => {
    // ⚠️ Decisão do usuário. É a única regra que pode dar falso positivo num
    // template válido — LaTeX tem construtos onde chave desbalanceada é
    // legítima. E o Overleaf já mostrou o PDF compilando antes do upload.
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '\\def\\x{aberta' });
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(r.erros).toEqual([]);
    expect(r.podePublicar).toBe(true);
  });

  it('chave escapada e comentada não conta no balanço', () => {
    const r = lintarTemplate({
      ...OK,
      'preambulo.tex': '\\textbackslash\\{ % aqui tem { solta no comentário',
    });
    expect(r.avisos).toEqual([]);
  });

  it('macro que o metadados.tex não define AVISA', () => {
    const r = lintarTemplate({
      ...OK,
      'main.tex': OK['main.tex'] + '\n\\cadernoInexistente',
    });
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(r.podePublicar).toBe(true);
  });

  it('as QUATRO macros que o metadados.tex gera não avisam', () => {
    // ⚠️ São quatro, não três — medido em `gerar-caderno.ts:90-105`.
    // `\cadernoTitulo` e `\cadernoSubtitulo` sempre; `\cadernoRascunho` (como
    // `\cadernoRascunhotrue`) e `\cadernoPendencias` só no modo rascunho.
    const r = lintarTemplate({
      ...OK,
      'main.tex':
        OK['main.tex'] +
        '\n\\cadernoTitulo\\cadernoSubtitulo\\cadernoPendencias' +
        '\n\\ifcadernoRascunho\\cadernoRascunhotrue\\fi',
    });
    expect(r.avisos).toEqual([]);
  });

  it('macro que o PRÓPRIO template define não avisa', () => {
    // ⚠️ O `preambulo.tex` real tem `\providecommand{\cadernoTitulo}{...}`
    // justamente para o caso de o `metadados.tex` não vir. Se um
    // `\providecommand` próprio não contasse como definição, o mecanismo de
    // default do template viraria aviso.
    const r = lintarTemplate({
      ...OK,
      'preambulo.tex':
        '\\providecommand{\\cadernoLegenda}{padrão}\n\\cadernoLegenda',
    });
    expect(r.avisos).toEqual([]);
  });
});

describe('lintarTemplate — o erro diz onde', () => {
  it('nomeia o arquivo e a linha', () => {
    const r = lintarTemplate({ ...OK, 'preambulo.tex': '\n\n\\write18{ls}' });
    expect(r.erros[0]).toContain('preambulo.tex');
    expect(r.erros[0]).toMatch(/linha 3/);
  });
});
```

⚠️ O último teste é o que separa um lint útil de um lint irritante: *"erro de sintaxe"* sem arquivo e
linha faz o coordenador abrir os dois arquivos procurando.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/template-lint.spec.ts
```

Esperado: FAIL — `Cannot find module './template-lint'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/template/template-lint.ts`. O contrato:

```ts
export interface ResultadoDoLint {
  erros: string[];
  avisos: string[];
  /** `true` quando não há erros. O publicar consulta só isto. */
  podePublicar: boolean;
}

export function lintarTemplate(
  arquivos: Record<string, string>,
): ResultadoDoLint;
```

O que ele faz, em ordem:

1. Limpa **cada arquivo** com `semComentarios`, guardando o texto limpo por linha
2. Junta os dois limpos para as regras de **presença** (`\documentclass` pode estar em qualquer um)
3. Roda as sete de erro e as duas de aviso
4. `podePublicar = erros.length === 0`

⚠️ **As mensagens levam arquivo e linha.** Para as regras de presença, arquivo não se aplica — a
mensagem diz o que faltou. Para as de conteúdo (proibidos, balanceamento), diz onde.

⚠️ **As macros conhecidas são QUATRO**, medidas em `gerar-caderno.ts:90-105`: `\cadernoTitulo` e
`\cadernoSubtitulo` sempre; `\cadernoRascunho` (um `\newif`, usado como `\ifcadernoRascunho` e ligado
por `\cadernoRascunhotrue`) e `\cadernoPendencias` **só no modo rascunho**. O `preambulo.tex` real usa
`\cadernoPendencias` na linha 90 — com uma lista de três, o template do repo avisaria.

Conta como definida também a macro que **o próprio template define** (`\def`, `\newcommand`,
`\providecommand`, `\newif`). O `preambulo.tex` tem `\providecommand{\cadernoTitulo}{...}` de
propósito, para quando o `metadados.tex` não vem; avisar sobre isso transformaria o mecanismo de
default em ruído.

Só o que sobra — um `\caderno…` que ninguém define — vira aviso.

⚠️ **O balanço de chaves ignora comentários E `\{` `\}` escapados.** Sem isso, um `%` com chave solta
num comentário produziria aviso falso — e aviso falso repetido faz a pessoa parar de ler os avisos.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/template-lint.spec.ts
```

Esperado: PASS, 27 testes (os dois `it.each` contam 8 e 6 casos).

- [ ] **Step 5: Provar que quatro decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| lintar o texto **cru**, sem `semComentarios` | `O CASO PERIGOSO` **e** `o proibido dentro de comentário NÃO é erro` |
| chaves virarem `erros` em vez de `avisos` | `chave desbalanceada AVISA, e deixa publicar` |
| a regra de caminho barrar qualquer `/` | `\input{sub/arquivo} NÃO é erro` |
| tirar arquivo e linha da mensagem | `nomeia o arquivo e a linha` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/template/template-lint.ts src/modules/caderno/template/template-lint.spec.ts
npx eslint src/modules/caderno/template/template-lint.ts src/modules/caderno/template/template-lint.spec.ts
git add src/modules/caderno/template/template-lint.ts src/modules/caderno/template/template-lint.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): lint do template -- 7 bloqueiam, 2 avisam

Chaves desbalanceadas AVISAM em vez de bloquear: e a unica das 8 regras
que pode dar falso positivo em template valido (LaTeX tem construtos com
chave solta legitima), e o fluxo ja garante uma compilacao real no
Overleaf antes do upload. Falso positivo aqui trava o coordenador depois
de ele ter visto o PDF pronto.

`\input{sub/arquivo}` NAO e erro: a regra e sobre SAIR do diretorio, nao
sobre ter barra. Subcaminho so nao existe no zip, e a falha aparece na
compilacao.

Toda regra roda sobre o texto SEM COMENTARIO -- senao um
`\input{conteudo}` comentado passa e a prova sai vazia, e um `\write18`
comentado bloqueia sem motivo.

As mensagens levam arquivo e linha: "erro de sintaxe" sozinho faz o
coordenador abrir os dois arquivos procurando.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 3: `extrair-zip.ts` — whitelist, limites e travessia

**Files:**
- Create: `src/modules/caderno/template/__fixtures__/zip.ts`
- Create: `src/modules/caderno/template/extrair-zip.spec.ts`
- Create: `src/modules/caderno/template/extrair-zip.ts`

O que entra aqui é o projeto inteiro do Overleaf: os dois arquivos que interessam, mais o
`conteudo.tex` e o `metadados.tex` do mock, `assets/`, provavelmente `main.pdf` e os auxiliares.

⚠️ **A ordem importa.** Os limites são checados **antes** de descompactar. Um zip de 200 MB ou com
5000 entradas não pode ser lido para a memória e só então rejeitado — isso é o zip bomb funcionando.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/template/extrair-zip.spec.ts`:

Antes do spec, o helper — ele é usado também pelo controller, na Task 6, e importar de um `.spec.ts`
não funciona. `src/modules/caderno/template/__fixtures__/zip.ts`:

```ts
import JSZip from 'jszip';

/** Monta um zip em memória, como o que o Overleaf entrega. */
export async function zipCom(
  entradas: Record<string, string | Buffer>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [nome, conteudo] of Object.entries(entradas)) {
    zip.file(nome, conteudo);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}
```

E o spec:

```ts
import JSZip from 'jszip';
import { zipCom } from './__fixtures__/zip';
import { extrairTemplateDoZip, LIMITES } from './extrair-zip';

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
```

⚠️ No caso do caractere de controle, escreva o **escape** `\u0001` no fixture, nunca o byte cru — um
byte de controle no meio de um `.spec.ts` fica invisível em diff e em code review.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/extrair-zip.spec.ts
```

Esperado: FAIL — `Cannot find module './extrair-zip'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/template/extrair-zip.ts`. O contrato:

```ts
export const LIMITES = {
  zipBytes: 5 * 1024 * 1024,
  arquivoBytes: 256 * 1024,
  entradas: 200,
} as const;

export type ResultadoDaExtracao =
  | { ok: true; arquivos: Record<string, string>; ignorados: string[] }
  | { ok: false; erro: string };

export async function extrairTemplateDoZip(
  buffer: Buffer,
): Promise<ResultadoDaExtracao>;
```

A ordem, que é a parte que importa:

1. `buffer.length > LIMITES.zipBytes` → recusa. **Antes do `loadAsync`.**
2. `JSZip.loadAsync` dentro de `try` — buffer inválido vira `{ ok: false }`, não exceção
3. contar as entradas → acima de `LIMITES.entradas`, recusa. **Antes de qualquer `async()`.**
4. validar **todos** os nomes → qualquer um com `..` como segmento, barra inicial (`/` ou `\`), letra
   de unidade (`C:`) ou caractere de controle (`/[\u0000-\u001f]/`) rejeita o zip inteiro
5. casar `basename.toLowerCase()` contra `['main.tex','preambulo.tex']`, ignorando diretórios
6. faltando um dos dois → recusa nomeando **só o que faltou**
7. para cada aceito: `async('nodebuffer')`, checar `arquivoBytes`, decodificar UTF-8 **estrito**
8. o resto vira `ignorados`, com o caminho como veio no zip

⚠️ **UTF-8 estrito não é `toString('utf-8')`** — esse substitui byte inválido por `U+FFFD` calado. Use
`new TextDecoder('utf-8', { fatal: true })` dentro de `try`.

⚠️ **Duas entradas casando o mesmo alvo** (`main.tex` e `src/Main.tex`): a última vence e a anterior
**não** entra em `ignorados` — ela foi considerada, não descartada. Não é caso a tratar; é caso a não
esconder.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/extrair-zip.spec.ts
```

Esperado: PASS, 14 testes (o `it.each` de travessia conta 4 casos).

- [ ] **Step 5: Provar que as decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| trocar o decode por `buf.toString('utf-8')` | `bytes não-UTF-8 → mensagem clara` |
| pular a entrada ruim em vez de rejeitar o zip | os quatro casos de travessia |
| casar o caminho inteiro em vez do basename | `pasta raiz funciona igual` |
| casar sem `toLowerCase` | `Main.tex maiúsculo é aceito` |
| checar o tamanho **depois** do `loadAsync` | **nenhum** — é o ponto cego do Step 6 |

- [ ] **Step 6: Provar a ordem, que teste de resultado não pega**

Um teste que só olha `{ ok: false }` não distingue "recusou antes de ler" de "leu e recusou" — e é
exatamente essa diferença que o limite existe para garantir.

Prove por instrumentação: espione `JSZip.loadAsync` e confirme que, com um buffer acima do limite, ele
**não foi chamado**.

```ts
it('acima do limite, o zip nem chega a ser aberto', async () => {
  const espiao = jest.spyOn(JSZip, 'loadAsync');
  await extrairTemplateDoZip(Buffer.alloc(LIMITES.zipBytes + 1));
  expect(espiao).not.toHaveBeenCalled();
  espiao.mockRestore();
});
```

⚠️ Se o espião não puder ser instalado (export não configurável), **reporte em vez de apagar o teste**.
A alternativa é medir o tempo, e tempo é fixture frágil.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/modules/caderno/template/__fixtures__/zip.ts src/modules/caderno/template/extrair-zip.ts src/modules/caderno/template/extrair-zip.spec.ts
npx eslint src/modules/caderno/template/__fixtures__/zip.ts src/modules/caderno/template/extrair-zip.ts src/modules/caderno/template/extrair-zip.spec.ts
git add src/modules/caderno/template/__fixtures__/zip.ts src/modules/caderno/template/extrair-zip.ts src/modules/caderno/template/extrair-zip.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): extrair main.tex e preambulo.tex do zip do Overleaf

Whitelist rigida, busca case-insensitive e tolerante a pasta raiz (o
Overleaf entrega dos dois jeitos), e o resto do projeto listado em
`ignorados` para a tela mostrar o que NAO subiu.

A ordem e a parte que importa: tamanho e numero de entradas sao
checados ANTES do loadAsync. Recusar depois de descompactar e o zip
bomb funcionando. Tem teste de instrumentacao para isso -- um teste que
so olha o resultado nao distingue "recusou antes" de "leu e recusou".

Decode UTF-8 estrito via TextDecoder({fatal:true}): toString('utf-8')
troca byte invalido por U+FFFD calado, e a prova sai com losango preto.

Nome com `..`, absoluto ou caractere de controle rejeita o ZIP INTEIRO.
Nome de arquivo vindo de upload e path traversal na montagem do zip da
prova, no card 11.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: schema e repositório

**Files:**
- Create: `src/modules/caderno/template/caderno-template.schema.ts`
- Create: `src/modules/caderno/template/caderno-template.schema.spec.ts`
- Create: `src/modules/caderno/template/caderno-template.repository.ts`
- Create: `src/modules/caderno/template/caderno-template.repository.spec.ts`

⚠️ **O que esta task NÃO tem: teste contra Mongo de verdade.** Medido: não existe
`mongodb-memory-server` no repo, e os specs em `src/` mockam o model (veja
`categoria.repository.spec.ts`). O `yarn test` do CI roda **só** `src/**/*.spec.ts` (`rootDir: src`);
os `test/*.e2e-spec.ts` exigem Mongo real e **o CI não os executa**. A Task 8 cuida disso com um gate
manual — não finja aqui que a concorrência está coberta.

- [ ] **Step 1: Escrever a spec do schema**

`src/modules/caderno/template/caderno-template.schema.spec.ts`, no molde do
`historico.schema.spec.ts`:

```ts
import { CadernoTemplateSchema } from './caderno-template.schema';

const indices = () => CadernoTemplateSchema.indexes();

describe('CadernoTemplate schema', () => {
  it('tem os campos do card', () => {
    for (const campo of [
      'versao',
      'status',
      'arquivos',
      'criadorId',
      'publicadaEm',
      'notas',
      'origemVersao',
    ]) {
      expect(CadernoTemplateSchema.path(campo)).toBeDefined();
    }
  });

  it('status só aceita os três estados', () => {
    const enumerado = (CadernoTemplateSchema.path('status') as any)
      .enumValues as string[];
    expect([...enumerado].sort()).toEqual([
      'arquivada',
      'publicada',
      'rascunho',
    ]);
  });

  it('versao é única', () => {
    const idx = indices().find(
      ([campos]) => (campos as Record<string, unknown>).versao === 1,
    );
    expect(idx).toBeDefined();
    expect((idx![1] as Record<string, unknown>).unique).toBe(true);
  });

  it('ÍNDICE PARCIAL: no máximo um rascunho', () => {
    // ⚠️ É a única coisa que garante um rascunho por vez. Declarado sem o
    // partialFilterExpression, ele tornaria `status` único no mundo — uma
    // única versão arquivada no banco inteiro — e o erro só apareceria na
    // segunda escrita, em produção.
    const parciais = indices().filter(
      ([, opts]) => (opts as Record<string, unknown>).partialFilterExpression,
    );
    expect(parciais).toHaveLength(1);

    const [campos, opts] = parciais[0];
    expect(campos).toEqual({ status: 1 });
    expect((opts as Record<string, unknown>).unique).toBe(true);
    expect((opts as Record<string, unknown>).partialFilterExpression).toEqual({
      status: 'rascunho',
    });
  });

  it('existe também o índice NÃO-único em status, para as consultas', () => {
    const simples = indices().filter(
      ([campos, opts]) =>
        (campos as Record<string, unknown>).status === 1 &&
        !(opts as Record<string, unknown>).unique,
    );
    expect(simples).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar, confirmar que falha, implementar o schema**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/caderno-template.schema.spec.ts
```

Esperado: FAIL — `Cannot find module './caderno-template.schema'`.

`src/modules/caderno/template/caderno-template.schema.ts`:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

export type StatusTemplate = 'rascunho' | 'publicada' | 'arquivada';

@Schema({ timestamps: true, versionKey: false })
export class CadernoTemplate extends BaseSchema {
  @Prop({ required: true })
  @ApiProperty()
  public versao: number;

  @Prop({ required: true, enum: ['rascunho', 'publicada', 'arquivada'] })
  @ApiProperty({ enum: ['rascunho', 'publicada', 'arquivada'] })
  public status: StatusTemplate;

  /** `'main.tex'` -> o texto inteiro. Só os dois da whitelist. */
  @Prop({ type: Map, of: String, required: true })
  @ApiProperty()
  public arquivos: Map<string, string>;

  @Prop({ required: true })
  @ApiProperty()
  public criadorId: string;

  @Prop({ default: null })
  @ApiProperty({ required: false })
  public publicadaEm?: Date | null;

  @Prop({ default: '' })
  @ApiProperty({ required: false })
  public notas: string;

  /** Preenchido quando o rascunho nasceu de uma restauração. */
  @Prop({ default: null })
  @ApiProperty({ required: false })
  public origemVersao?: number | null;
}

export const CadernoTemplateSchema =
  SchemaFactory.createForClass(CadernoTemplate);

CadernoTemplateSchema.index({ versao: 1 }, { unique: true });
CadernoTemplateSchema.index({ status: 1 });

// ⚠️ O parcial é o que garante NO MÁXIMO UM RASCUNHO. Sem o
// partialFilterExpression, `status` viraria único no mundo: uma só versão
// arquivada no banco inteiro. Tem spec própria porque é fácil de declarar
// errado e o erro só aparece na segunda escrita.
CadernoTemplateSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'rascunho' } },
);
```

- [ ] **Step 3: Escrever a spec do repositório**

`src/modules/caderno/template/caderno-template.repository.spec.ts`, no molde do
`categoria.repository.spec.ts` — model mockado:

```ts
import { CadernoTemplateRepository } from './caderno-template.repository';

function repoCom(overrides: Record<string, unknown> = {}) {
  const model = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    startSession: jest.fn(),
    ...overrides,
  } as any;
  return { model, repo: new CadernoTemplateRepository(model) };
}

const comExec = (valor: unknown) => ({
  exec: jest.fn().mockResolvedValue(valor),
});

describe('CadernoTemplateRepository — as consultas', () => {
  it('publicada() busca por status', async () => {
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue(comExec({ versao: 3 })),
    });

    await repo.publicada();

    expect(model.findOne).toHaveBeenCalledWith({ status: 'publicada' });
  });

  it('rascunho() busca por status rascunho', async () => {
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue(comExec(null)),
    });

    expect(await repo.rascunho()).toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ status: 'rascunho' });
  });

  it('versoes() ordena DECRESCENTE', async () => {
    // ⚠️ Ascendente é a ordem natural do índice e passaria despercebido numa
    // lista de duas linhas. A tela mostra a mais nova em cima.
    const sort = jest.fn().mockReturnValue(comExec([]));
    const { repo } = repoCom({ find: jest.fn().mockReturnValue({ sort }) });

    await repo.versoes();

    expect(sort).toHaveBeenCalledWith({ versao: -1 });
  });

  it('maiorVersao() devolve 0 quando a coleção está vazia', async () => {
    // ⚠️ `0`, e não `null`: quem chama faz `max + 1`. `null + 1` é 1 por
    // acidente do JS; devolver 0 faz a primeira versão ser 1 por decisão.
    const sort = jest.fn().mockReturnValue(comExec(null));
    const { repo } = repoCom({ findOne: jest.fn().mockReturnValue({ sort }) });

    expect(await repo.maiorVersao()).toBe(0);
  });

  it('porVersao() busca pelo numero, e devolve null quando não existe', async () => {
    // ⚠️ Existe para o restaurar. A alternativa — carregar `versoes()` e
    // procurar no array — funciona hoje com dezenas de versões e vira uma
    // varredura da coleção inteira sem que nada avise.
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue(comExec(null)),
    });

    expect(await repo.porVersao(2)).toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ versao: 2 });
  });

  it('maiorVersao() considera TODOS os status', async () => {
    // ⚠️ Filtrar por 'publicada' aqui reaproveitaria o número de uma versão
    // arquivada e explodiria no índice único de `versao` — em produção, no
    // meio de um publicar.
    const sort = jest.fn().mockReturnValue(comExec({ versao: 9 }));
    const { model, repo } = repoCom({
      findOne: jest.fn().mockReturnValue({ sort }),
    });

    expect(await repo.maiorVersao()).toBe(9);
    expect(model.findOne).toHaveBeenCalledWith({});
  });
});

describe('CadernoTemplateRepository — a imutabilidade da publicada', () => {
  // ⚠️ O card exige "não há caminho de escrita que altere uma publicada".
  // Isso não é um teste: é uma propriedade de TODOS os métodos de escrita, e
  // o jeito de garanti-la é o filtro carregar o status esperado.

  it('arquivarPublicada só atinge quem está publicada', async () => {
    const { model, repo } = repoCom({
      updateOne: jest.fn().mockReturnValue(comExec({ modifiedCount: 1 })),
    });

    await repo.arquivarPublicada();

    const [filtro] = model.updateOne.mock.calls[0];
    expect(filtro).toEqual({ status: 'publicada' });
  });

  it('promoverRascunho só atinge quem está rascunho', async () => {
    const { model, repo } = repoCom({
      updateOne: jest.fn().mockReturnValue(comExec({ modifiedCount: 1 })),
    });

    await repo.promoverRascunho(7);

    const [filtro, update] = model.updateOne.mock.calls[0];
    expect(filtro).toEqual({ status: 'rascunho' });
    expect(update.$set.versao).toBe(7);
    expect(update.$set.status).toBe('publicada');
    expect(update.$set.publicadaEm).toBeInstanceOf(Date);
  });

  it('descartarRascunho só apaga rascunho', async () => {
    const { model, repo } = repoCom({
      deleteOne: jest.fn().mockReturnValue(comExec({ deletedCount: 1 })),
    });

    await repo.descartarRascunho();

    expect(model.deleteOne.mock.calls[0][0]).toEqual({ status: 'rascunho' });
  });

  it('CATRACA: nenhum método de escrita novo entra sem prova', () => {
    // ⚠️ Não é asserção de comportamento, é catraca: quebra quando alguém
    // adiciona um caminho de escrita, obrigando a decidir conscientemente se
    // ele pode tocar uma `publicada`. Que é o modo de falha do card.
    const escritas = Object.getOwnPropertyNames(
      CadernoTemplateRepository.prototype,
    ).filter((m) =>
      /^(arquivar|promover|descartar|substituir|criar|atualizar|remover)/.test(
        m,
      ),
    );

    expect(escritas.sort()).toEqual([
      'arquivarPublicada',
      'criarRascunho',
      'descartarRascunho',
      'promoverRascunho',
      'substituirRascunho',
    ]);
  });
});
```

- [ ] **Step 4: Implementar o repositório**

`src/modules/caderno/template/caderno-template.repository.ts`, estendendo `BaseRepository` como o
`prova.repository.ts`. Os métodos:

| método | o que faz |
|---|---|
| `publicada()` | `findOne({status:'publicada'}).exec()` |
| `rascunho()` | `findOne({status:'rascunho'}).exec()` |
| `versoes()` | `find().sort({versao:-1}).exec()` |
| `porVersao(n)` | `findOne({versao:n}).exec()` — para o restaurar |
| `maiorVersao()` | `findOne({}).sort({versao:-1}).exec()`, `0` quando vazio |
| `criarRascunho(dados, session?)` | insere com `status:'rascunho'` |
| `substituirRascunho(dados)` | `descartarRascunho()` e depois `criarRascunho()` — último upload vence |
| `descartarRascunho()` | `deleteOne({status:'rascunho'}).exec()` |
| `arquivarPublicada(session?)` | `updateOne({status:'publicada'}, {$set:{status:'arquivada'}})` |
| `promoverRascunho(versao, session?)` | `updateOne({status:'rascunho'}, {$set:{status:'publicada', versao, publicadaEm: new Date()}})` |

⚠️ **Todo filtro de escrita carrega o status esperado.** Nunca `updateOne({_id})`: um `_id` não diz em
que estado o documento está, e é assim que uma `publicada` acaba alterada.

⚠️ `session` é opcional em todos, e repassado via `.session(session)` quando vier — é o padrão do
`prova.repository.ts`.

- [ ] **Step 5: Rodar tudo e confirmar**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/
```

Esperado: PASS.

- [ ] **Step 6: Provar que as decisões mordem**

| Mutação | Teste vermelho |
|---|---|
| tirar o `partialFilterExpression` do índice | `ÍNDICE PARCIAL: no máximo um rascunho` |
| `sort({versao: 1})` em `versoes()` | `versoes() ordena DECRESCENTE` |
| `maiorVersao()` filtrar `{status:'publicada'}` | `maiorVersao() considera TODOS os status` |
| `porVersao()` filtrar por `_id` | `porVersao() busca pelo numero` |
| `promoverRascunho` filtrar por `_id` | `promoverRascunho só atinge quem está rascunho` |

- [ ] **Step 7: Commit**

```bash
npx prettier --write "src/modules/caderno/template/caderno-template.@(schema|repository).ts" "src/modules/caderno/template/caderno-template.@(schema|repository).spec.ts"
npx eslint src/modules/caderno/template/caderno-template.schema.ts src/modules/caderno/template/caderno-template.schema.spec.ts src/modules/caderno/template/caderno-template.repository.ts src/modules/caderno/template/caderno-template.repository.spec.ts
git add src/modules/caderno/template/caderno-template.schema.ts src/modules/caderno/template/caderno-template.schema.spec.ts src/modules/caderno/template/caderno-template.repository.ts src/modules/caderno/template/caderno-template.repository.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): colecao de templates versionados

Indice parcial unico em status:'rascunho' garante no maximo um rascunho.
Tem spec propria, no molde do historico.schema.spec.ts: sem o
partialFilterExpression o indice tornaria `status` unico no mundo -- uma
so versao arquivada no banco inteiro -- e o erro so apareceria na
segunda escrita, em producao.

Imutabilidade da publicada nao e um teste, e uma propriedade de todos os
metodos de escrita: cada filtro carrega o status esperado, nunca `_id`
sozinho. Tem uma catraca que quebra quando alguem adiciona um metodo de
escrita novo sem prova-lo.

maiorVersao() olha TODOS os status: filtrar por publicada reaproveitaria
o numero de uma arquivada e explodiria no indice unico de `versao`, no
meio de um publicar.

Nao ha teste contra Mongo de verdade aqui, e isso e medido: nao existe
mongodb-memory-server no repo e o CI roda so src/**/*.spec.ts. A
concorrencia real fica no gate manual.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `caderno-template.service.ts` — publicar, restaurar, descartar

**Files:**
- Create: `src/modules/caderno/template/caderno-template.service.ts`
- Create: `src/modules/caderno/template/caderno-template.service.spec.ts`

Aqui as três peças se juntam. Duas decisões que valem antes do código:

**1. O lint roda duas vezes** — no upload, para feedback imediato; e de novo no publicar, porque o
rascunho pode ter vindo de uma restauração feita antes de uma regra nova existir.

**2. A transação arquiva ANTES de promover.** O repo já usa transações (`questao.service.ts:157`,
`custom_prova_factory.ts:90`), então o Mongo de produção é replica set e a transação vale. Mas a ordem
das duas escritas ainda importa: se a transação falhar pela metade em algum ambiente onde ela não
valha, o estado intermediário de **arquivar-primeiro** é "zero publicadas" → `GET /template` devolve
`503`, visível, e republicar conserta. O de **promover-primeiro** é "duas publicadas" — ambíguo, e a
ambiguidade sobre qual é a atual é exatamente o que a spec quer evitar.

Custa uma linha de ordem e uma asserção.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/template/caderno-template.service.spec.ts`:

```ts
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { CadernoTemplateService } from './caderno-template.service';

const TEMPLATE_BOM = {
  'main.tex': [
    '\\documentclass{exam}',
    '\\input{preambulo}',
    '\\input{metadados}',
    '\\begin{document}',
    '\\begin{questions}',
    '\\input{conteudo}',
    '\\end{questions}',
    '\\end{document}',
  ].join('\n'),
  'preambulo.tex': '\\usepackage[T1]{fontenc}',
};

const TEMPLATE_RUIM = {
  ...TEMPLATE_BOM,
  'main.tex': TEMPLATE_BOM['main.tex'].replace(
    '\\input{conteudo}',
    '% \\input{conteudo}',
  ),
};

const comoMap = (o: Record<string, string>) => new Map(Object.entries(o));

function servicoCom(repo: Record<string, unknown> = {}) {
  const sessao = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const repositorio = {
    publicada: jest.fn().mockResolvedValue(null),
    rascunho: jest.fn().mockResolvedValue(null),
    versoes: jest.fn().mockResolvedValue([]),
    porVersao: jest.fn().mockResolvedValue(null),
    maiorVersao: jest.fn().mockResolvedValue(0),
    criarRascunho: jest.fn().mockResolvedValue(undefined),
    substituirRascunho: jest.fn().mockResolvedValue(undefined),
    descartarRascunho: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    arquivarPublicada: jest.fn().mockResolvedValue(undefined),
    promoverRascunho: jest.fn().mockResolvedValue(undefined),
    startSession: jest.fn().mockResolvedValue(sessao),
    ...repo,
  } as any;
  return {
    sessao,
    repositorio,
    servico: new CadernoTemplateService(repositorio),
  };
}

describe('publicada()', () => {
  it('devolve a publicada quando existe', async () => {
    const { servico } = servicoCom({
      publicada: jest.fn().mockResolvedValue({ versao: 3 }),
    });
    expect((await servico.publicada()).versao).toBe(3);
  });

  it('NÃO existindo, lança 503 — e não cai no repo', async () => {
    // ⚠️ Depois deste card o Mongo é a fonte da verdade. Um fallback
    // silencioso ao disco reintroduziria a dúvida sobre qual é a atual: a
    // prova sairia com o layout antigo e ninguém saberia por quê.
    const { servico } = servicoCom();
    await expect(servico.publicada()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('salvarRascunho()', () => {
  it('com lint limpo: salva e devolve sem erros', async () => {
    const { repositorio, servico } = servicoCom();

    const r = await servico.salvarRascunho({
      arquivos: TEMPLATE_BOM,
      ignorados: ['main.pdf'],
      criadorId: 'u1',
      notas: 'capa nova',
    });

    expect(r.erros).toEqual([]);
    expect(r.aceitos.sort()).toEqual(['main.tex', 'preambulo.tex']);
    expect(r.ignorados).toEqual(['main.pdf']);
    expect(repositorio.substituirRascunho).toHaveBeenCalled();
  });

  it('COM ERRO DE LINT: salva assim mesmo e devolve os erros', async () => {
    // ⚠️ 200 com erros, não 4xx. Ele não perde o upload; quem recusa é o
    // publicar. Perder o zip de quem acabou de editar no Overleaf é o pior
    // resultado possível deste fluxo.
    const { repositorio, servico } = servicoCom();

    const r = await servico.salvarRascunho({
      arquivos: TEMPLATE_RUIM,
      ignorados: [],
      criadorId: 'u1',
      notas: '',
    });

    expect(r.erros.length).toBeGreaterThan(0);
    expect(repositorio.substituirRascunho).toHaveBeenCalled();
  });
});

describe('publicar()', () => {
  it('sem rascunho → 409', async () => {
    const { servico } = servicoCom();
    await expect(servico.publicar()).rejects.toBeInstanceOf(ConflictException);
  });

  it('RASCUNHO COM ERRO DE LINT → 409 com a lista, e nada é escrito', async () => {
    // ⚠️ O lint roda de novo aqui: o rascunho pode ter vindo de uma
    // restauração feita antes de uma regra nova existir.
    const { repositorio, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: comoMap(TEMPLATE_RUIM) }),
    });

    await expect(servico.publicar()).rejects.toBeInstanceOf(ConflictException);
    expect(repositorio.promoverRascunho).not.toHaveBeenCalled();
    expect(repositorio.arquivarPublicada).not.toHaveBeenCalled();
  });

  it('AVISO não impede publicar', async () => {
    // ⚠️ Chave desbalanceada é aviso. Se travasse aqui, a decisão do usuário
    // teria sido revertida silenciosamente no serviço.
    const { repositorio, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({
        arquivos: comoMap({
          ...TEMPLATE_BOM,
          'preambulo.tex': '\\def\\x{aberta',
        }),
      }),
      maiorVersao: jest.fn().mockResolvedValue(3),
    });

    await servico.publicar();

    expect(repositorio.promoverRascunho).toHaveBeenCalledWith(4, expect.anything());
  });

  it('versao = max + 1, olhando o maior de TODOS os status', async () => {
    const { repositorio, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: comoMap(TEMPLATE_BOM) }),
      maiorVersao: jest.fn().mockResolvedValue(7),
    });

    await servico.publicar();

    expect(repositorio.promoverRascunho).toHaveBeenCalledWith(8, expect.anything());
  });

  it('ARQUIVA ANTES DE PROMOVER', async () => {
    // ⚠️ Ordem, não conveniência. Um estado intermediário de "zero
    // publicadas" devolve 503 — visível, e republicar conserta. Um de "duas
    // publicadas" é ambíguo, e a ambiguidade sobre qual é a atual é o que
    // este card existe para evitar.
    const ordem: string[] = [];
    const { servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: comoMap(TEMPLATE_BOM) }),
      arquivarPublicada: jest.fn(async () => {
        ordem.push('arquivar');
      }),
      promoverRascunho: jest.fn(async () => {
        ordem.push('promover');
      }),
    });

    await servico.publicar();

    expect(ordem).toEqual(['arquivar', 'promover']);
  });

  it('commita a transação no caminho feliz', async () => {
    const { sessao, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: comoMap(TEMPLATE_BOM) }),
    });

    await servico.publicar();

    expect(sessao.startTransaction).toHaveBeenCalled();
    expect(sessao.commitTransaction).toHaveBeenCalled();
    expect(sessao.abortTransaction).not.toHaveBeenCalled();
    expect(sessao.endSession).toHaveBeenCalled();
  });

  it('ABORTA quando a segunda escrita falha', async () => {
    // ⚠️ Sem o abort, a sessão fica aberta e a primeira escrita pode vazar.
    const { sessao, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: comoMap(TEMPLATE_BOM) }),
      promoverRascunho: jest.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(servico.publicar()).rejects.toThrow('boom');
    expect(sessao.abortTransaction).toHaveBeenCalled();
    expect(sessao.commitTransaction).not.toHaveBeenCalled();
    expect(sessao.endSession).toHaveBeenCalled();
  });
});

describe('restaurar()', () => {
  it('cria rascunho com o conteúdo da versão e origemVersao', async () => {
    const { repositorio, servico } = servicoCom({
      porVersao: jest
        .fn()
        .mockResolvedValue({ versao: 2, arquivos: comoMap(TEMPLATE_BOM) }),
    });

    await servico.restaurar(2, 'u1');

    const [dados] = repositorio.substituirRascunho.mock.calls[0];
    expect(dados.origemVersao).toBe(2);
    expect(dados.criadorId).toBe('u1');
    expect(Object.fromEntries(dados.arquivos)).toEqual(TEMPLATE_BOM);
  });

  it('versão inexistente → 404', async () => {
    const { servico } = servicoCom();
    await expect(servico.restaurar(99, 'u1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('restaurar NÃO reabre a versão antiga — o histórico só avança', async () => {
    // ⚠️ Restaurar cria rascunho; publicar gera número novo. Nada de ponteiro
    // que anda para trás.
    const { repositorio, servico } = servicoCom({
      porVersao: jest
        .fn()
        .mockResolvedValue({ versao: 2, arquivos: comoMap(TEMPLATE_BOM) }),
    });

    await servico.restaurar(2, 'u1');

    expect(repositorio.promoverRascunho).not.toHaveBeenCalled();
    expect(repositorio.arquivarPublicada).not.toHaveBeenCalled();
  });
});

describe('descartarRascunho()', () => {
  it('sem rascunho → 404, e não finge que apagou', async () => {
    const { servico } = servicoCom({
      descartarRascunho: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    });
    await expect(servico.descartarRascunho()).rejects.toMatchObject({
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/caderno-template.service.spec.ts
```

Esperado: FAIL — `Cannot find module './caderno-template.service'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/template/caderno-template.service.ts`. A superfície:

```ts
export interface RespostaDoRascunho {
  aceitos: string[];
  ignorados: string[];
  erros: string[];
  avisos: string[];
}

@Injectable()
export class CadernoTemplateService {
  constructor(private readonly repo: CadernoTemplateRepository) {}

  publicada(): Promise<CadernoTemplate>;          // 503 quando não há
  rascunho(): Promise<CadernoTemplate | null>;    // null; o controller faz o 404
  versoes(): Promise<CadernoTemplate[]>;
  salvarRascunho(entrada: {
    arquivos: Record<string, string>;
    ignorados: string[];
    criadorId: string;
    notas: string;
  }): Promise<RespostaDoRascunho>;
  publicar(): Promise<CadernoTemplate>;           // 409 sem rascunho ou com erro
  restaurar(versao: number, criadorId: string): Promise<void>;  // 404
  descartarRascunho(): Promise<void>;             // 404
}
```

`publicar()`, na ordem:

1. `rascunho()` → sem rascunho, `ConflictException`
2. `lintarTemplate(Object.fromEntries(rascunho.arquivos))` → `podePublicar === false` vira
   `ConflictException` com a lista. **Nada é escrito.**
3. `maiorVersao() + 1`
4. `startSession`, `startTransaction`
5. `arquivarPublicada(session)` — **primeiro**
6. `promoverRascunho(versao, session)` — **depois**
7. `commitTransaction`; no `catch`, `abortTransaction` e relança; `endSession` nos dois caminhos

⚠️ `salvarRascunho` **nunca lança por erro de lint.** Ele lint-a, guarda, e devolve os erros. O
controller responde 200.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/caderno-template.service.spec.ts
```

Esperado: PASS, 15 testes.

- [ ] **Step 5: Provar que as decisões mordem**

| Mutação | Teste vermelho |
|---|---|
| `publicada()` cair no disco em vez de 503 | `NÃO existindo, lança 503` |
| `salvarRascunho` lançar quando o lint reprova | `COM ERRO DE LINT: salva assim mesmo` |
| `publicar` pular o lint (confiar no do upload) | `RASCUNHO COM ERRO DE LINT → 409` |
| `publicar` bloquear com aviso | `AVISO não impede publicar` |
| promover antes de arquivar | `ARQUIVA ANTES DE PROMOVER` |
| tirar o `abortTransaction` do catch | `ABORTA quando a segunda escrita falha` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/template/caderno-template.service.ts src/modules/caderno/template/caderno-template.service.spec.ts
npx eslint src/modules/caderno/template/caderno-template.service.ts src/modules/caderno/template/caderno-template.service.spec.ts
git add src/modules/caderno/template/caderno-template.service.ts src/modules/caderno/template/caderno-template.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): servico de template -- publicar, restaurar, descartar

O lint roda DUAS vezes: no upload, para feedback imediato, e de novo no
publicar, porque o rascunho pode ter vindo de uma restauracao feita
antes de uma regra nova existir.

Erro de lint no upload NAO lanca: o rascunho e salvo e os erros voltam
na resposta. Perder o zip de quem acabou de editar no Overleaf e o pior
resultado possivel deste fluxo. Quem recusa e o publicar, com 409.

A transacao ARQUIVA ANTES DE PROMOVER. Ordem, nao conveniencia: um
estado intermediario de "zero publicadas" devolve 503, visivel, e
republicar conserta; um de "duas publicadas" e ambiguo, e a ambiguidade
sobre qual e a atual e o que este card existe para evitar.

Sem versao publicada, `publicada()` da 503 e NAO cai no disco. Depois
deste card o Mongo e a fonte da verdade; fallback silencioso faria a
prova sair com o layout antigo sem ninguem saber por que.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: controller, módulo e o primeiro multipart do ms-simulado

**Files:**
- Create: `src/modules/caderno/template/dtos/upload-rascunho.dto.ts`
- Create: `src/modules/caderno/template/caderno-template.controller.ts`
- Create: `src/modules/caderno/template/caderno-template.controller.spec.ts`
- Create: `src/modules/caderno/template/caderno-template.module.ts`
- Create: `src/modules/caderno/template/caderno-template.module.spec.ts`
- Modify: `src/app.module.ts` — registrar o `CadernoTemplateModule`
- Modify: `package.json` — `@types/multer`

⚠️ **Este é o primeiro endpoint multipart do ms-simulado.** Medido: `FileInterceptor` não aparece em
lugar nenhum de `src/`. `multer` já está instalado (1.4.4-lts.1, transitivo do
`@nestjs/platform-express`), mas `@types/multer` **não** — sem ele, `Express.Multer.File` não existe e
o `yarn build` quebra.

⚠️ **`criadorId` vem no corpo, injetado pelo api-vcnafacul a partir do JWT** — é o padrão já
estabelecido em `prova/dtos/create.dto.input.ts:44-48`. O ms não tem auth própria; quem protege é o
card 12.

- [ ] **Step 1: Instalar o tipo**

```bash
yarn add -D @types/multer
```

⚠️ Confira o diff do `yarn.lock`: deve conter **só** a entrada de `@types/multer` e o que ela puxa. Se
vier um bloco grande de pacotes não relacionados, reverta o lockfile e reporte — foi o que aconteceu
no api-vcnafacul durante o card 04.

- [ ] **Step 2: Escrever o teste do controller**

`src/modules/caderno/template/caderno-template.controller.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { zipCom } from './__fixtures__/zip';
import { CadernoTemplateController } from './caderno-template.controller';

const zipFalso = (buffer = Buffer.from('zip')) =>
  ({ buffer, originalname: 'projeto.zip' }) as Express.Multer.File;

function controllerCom(servico: Record<string, unknown> = {}) {
  const s = {
    publicada: jest.fn().mockResolvedValue({ versao: 3 }),
    rascunho: jest.fn().mockResolvedValue(null),
    versoes: jest.fn().mockResolvedValue([]),
    salvarRascunho: jest
      .fn()
      .mockResolvedValue({ aceitos: [], ignorados: [], erros: [], avisos: [] }),
    publicar: jest.fn().mockResolvedValue({ versao: 4 }),
    restaurar: jest.fn().mockResolvedValue(undefined),
    descartarRascunho: jest.fn().mockResolvedValue(undefined),
    ...servico,
  } as any;
  return { servico: s, controller: new CadernoTemplateController(s) };
}

describe('POST /template/rascunho', () => {
  it('sem arquivo → 400, e não chama o serviço', async () => {
    const { servico, controller } = controllerCom();

    await expect(
      controller.subirRascunho(undefined as any, {
        criadorId: 'u1',
        notas: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(servico.salvarRascunho).not.toHaveBeenCalled();
  });

  it('zip inválido → 400 com o motivo da extração', async () => {
    const { controller } = controllerCom();

    await expect(
      controller.subirRascunho(zipFalso(Buffer.from('não é zip')), {
        criadorId: 'u1',
        notas: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ERRO DE LINT devolve 200 com os erros, não exceção', async () => {
    // ⚠️ O contrato do card. Um 4xx aqui faria o cliente descartar o corpo e
    // a pessoa perder o upload.
    const { controller } = controllerCom({
      salvarRascunho: jest.fn().mockResolvedValue({
        aceitos: ['main.tex', 'preambulo.tex'],
        ignorados: ['main.pdf'],
        erros: ['main.tex: falta \\input{conteudo}'],
        avisos: [],
      }),
    });

    const zip = await zipCom({ 'main.tex': 'a', 'preambulo.tex': 'b' });
    const r = await controller.subirRascunho(zipFalso(zip), {
      criadorId: 'u1',
      notas: 'capa nova',
    });

    expect(r.erros).toHaveLength(1);
  });
});

describe('GET /template/rascunho', () => {
  it('sem rascunho → 404', async () => {
    const { controller } = controllerCom();
    await expect(controller.getRascunho()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('as rotas', () => {
  it('estão sob v1/caderno/template', () => {
    // ⚠️ O card 12 monta o proxy em cima deste caminho; divergir aqui quebra
    // um repo que ainda não existe, e o erro aparece só na integração.
    expect(Reflect.getMetadata('path', CadernoTemplateController)).toBe(
      'v1/caderno/template',
    );
  });
});
```

- [ ] **Step 3: Implementar o DTO**

`src/modules/caderno/template/dtos/upload-rascunho.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadRascunhoDto {
  // Campo INTERNO: injetado pelo api-vcnafacul a partir do JWT (req.user.id),
  // não vem do cliente. Mesmo padrão de prova/dtos/create.dto.input.ts.
  @ApiProperty()
  @IsString()
  criadorId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notas?: string;
}
```

⚠️ **Num multipart, todo campo chega como string** — não use `@IsNumber` nem `@IsBoolean` aqui sem
`@Type`. Hoje não há nenhum; é para não aparecer depois.

- [ ] **Step 4: Implementar o controller**

`src/modules/caderno/template/caderno-template.controller.ts`, os **sete** endpoints:

| verbo | rota | resposta |
|---|---|---|
| `GET` | `/` | a publicada; `503` quando não há (vem do serviço) |
| `GET` | `/rascunho` | o rascunho; `404` quando não há |
| `POST` | `/rascunho` | `FileInterceptor('arquivo')` → extrai, lint, salva. `200` mesmo com erro de lint; `400` só quando a **extração** falha |
| `DELETE` | `/rascunho` | `204`; `404` quando não havia |
| `POST` | `/rascunho/publicar` | a versão nova; `409` do serviço |
| `GET` | `/versoes` | lista decrescente |
| `POST` | `/versoes/:n/restaurar` | cria o rascunho; `404` para versão inexistente |

⚠️ **`GET /template/teste` NÃO entra aqui** — é do card 11, apesar de aparecer no fluxo do card 10.

⚠️ **`:n` precisa de `ParseIntPipe`.** Sem ele, `/versoes/abc/restaurar` chega como string e a
comparação `v.versao === n` falha calada, devolvendo 404 em vez de 400. Um `_id` de Mongo nesta rota
não existe, então o `ObjectIdPipe` do api não se aplica.

⚠️ Limite do `FileInterceptor`: `{ limits: { fileSize: LIMITES.zipBytes } }`. É a **segunda** trava; a
primeira é a da Task 3. As duas existem porque esta corta antes de o corpo inteiro entrar na memória
do processo, e a outra é a que tem teste.

- [ ] **Step 5: Módulo e registro**

`src/modules/caderno/template/caderno-template.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CadernoTemplateController } from './caderno-template.controller';
import {
  CadernoTemplate,
  CadernoTemplateSchema,
} from './caderno-template.schema';
import { CadernoTemplateRepository } from './caderno-template.repository';
import { CadernoTemplateService } from './caderno-template.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CadernoTemplate.name, schema: CadernoTemplateSchema },
    ]),
  ],
  controllers: [CadernoTemplateController],
  providers: [CadernoTemplateService, CadernoTemplateRepository],
  // ⚠️ Exportado porque o card 11 vai injetar o serviço no CadernoService
  // para montar o zip a partir do Mongo.
  exports: [CadernoTemplateService],
})
export class CadernoTemplateModule {}
```

`src/modules/caderno/template/caderno-template.module.spec.ts`, no molde do
`caderno.module.spec.ts` que já existe: compila o módulo e resolve o controller.

E registre em `src/app.module.ts`, junto dos outros.

- [ ] **Step 6: Rodar tudo, mais o build**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/
yarn build && ls -la dist/main.js
```

⚠️ **`dist/main.js` tem que estar na raiz do `dist`.** Um `.ts` fora de `src/` alcançado pelo build
move o `rootDir` e o PM2 morre com `Script not found /var/www/main.js`. O `scripts/` já está no
`exclude` do `tsconfig.build.json` — **não mexa nele**, e confirme aqui.

- [ ] **Step 7: Commit**

```bash
npx prettier --write "src/modules/caderno/template/**/*.ts" src/app.module.ts
npx eslint src/modules/caderno/template/caderno-template.controller.ts src/modules/caderno/template/caderno-template.controller.spec.ts src/modules/caderno/template/caderno-template.module.ts src/modules/caderno/template/caderno-template.module.spec.ts src/modules/caderno/template/dtos/upload-rascunho.dto.ts src/app.module.ts
git add src/modules/caderno/template/caderno-template.controller.ts src/modules/caderno/template/caderno-template.controller.spec.ts src/modules/caderno/template/caderno-template.module.ts src/modules/caderno/template/caderno-template.module.spec.ts src/modules/caderno/template/dtos/upload-rascunho.dto.ts src/app.module.ts package.json yarn.lock
git commit -m "$(cat <<'EOF'
feat(caderno): sete endpoints de template versionado

Primeiro multipart do ms-simulado: FileInterceptor nao aparecia em
lugar nenhum de src/. multer ja vinha transitivo do platform-express;
faltava @types/multer, sem o qual Express.Multer.File nao existe e o
build quebra.

Erro de lint devolve 200 com os erros -- um 4xx faria o cliente
descartar o corpo e a pessoa perder o upload que acabou de editar no
Overleaf. 400 so quando a EXTRACAO falha.

criadorId vem no corpo, injetado pelo api a partir do JWT: mesmo padrao
de prova/dtos/create.dto.input.ts. O ms nao tem auth propria; quem
protege e o card 12.

ParseIntPipe no :n de restaurar. Sem ele a comparacao com versao falha
calada e devolve 404 no lugar de 400.

GET /template/teste NAO entra aqui -- e do card 11, apesar de aparecer
no fluxo do card 10.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `scripts/seed-template-caderno.ts` — a versão 1

**Files:**
- Create: `scripts/seed-template-caderno.ts`
- Modify: `package.json` — o script `seed:template-caderno`

⚠️ **Vai em `scripts/`, não em `scripts/migrations/`, contra o que o card diz.** Aquele diretório é
shell + mongosh (`cleanup.sh`, `indices.sh`, `validate.sh`), e este seed precisa ler arquivos do repo e
validá-los pelo lint antes de inserir. TypeScript faz isso naturalmente; mongosh, não. O molde é o
`backfill-criador-id.ts`, que já existe e é o precedente de seed em TS neste repo.

- [ ] **Step 1: Escrever**

`scripts/seed-template-caderno.ts`:

```ts
/**
 * Seed one-off — Caderno / Card 10.
 *
 * Insere a versão 1 do template do caderno, lendo `main.tex` e `preambulo.tex`
 * de `src/modules/caderno/templates/v1/`. Depois deste seed, o Mongo é a fonte
 * da verdade do layout; os arquivos do repo ficam como semente, referência de
 * dev e cópia de resgate.
 *
 * Uso (apontando pro banco alvo):
 *   MONGODB="mongodb://.../db" npx ts-node scripts/seed-template-caderno.ts
 *
 * ⚠️ Idempotente: se já existir qualquer versão, sai sem escrever.
 * ⚠️ Passa pelo PRÓPRIO lint antes de inserir. Um seed que entra sem passar
 *    pela régua que todos os outros uploads passam é uma exceção que ninguém
 *    lembra depois — e é justamente a versão que o "restaurar" traz de volta.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { lintarTemplate } from '../src/modules/caderno/template/template-lint';

const DIR = path.join(__dirname, '../src/modules/caderno/templates/v1');
const COLECAO = 'cadernotemplates';

async function run(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }

  const arquivos = {
    'main.tex': fs.readFileSync(path.join(DIR, 'main.tex'), 'utf-8'),
    'preambulo.tex': fs.readFileSync(path.join(DIR, 'preambulo.tex'), 'utf-8'),
  };

  const lint = lintarTemplate(arquivos);
  if (lint.podePublicar === false) {
    console.error('❌ O template do repo não passa no lint:');
    lint.erros.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }
  lint.avisos.forEach((a) => console.warn(`⚠️  ${a}`));

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Falha ao obter a conexão do banco.');
    process.exit(1);
  }

  const existentes = await db.collection(COLECAO).countDocuments();
  if (existentes > 0) {
    console.log(`✓ Já existem ${existentes} versão(ões). Nada a fazer.`);
    await mongoose.disconnect();
    return;
  }

  const agora = new Date();
  await db.collection(COLECAO).insertOne({
    versao: 1,
    status: 'publicada',
    arquivos,
    criadorId: 'system',
    publicadaEm: agora,
    notas: 'seed do repo',
    origemVersao: null,
    deleted: false,
    createdAt: agora,
    updatedAt: agora,
  });

  console.log('✓ Versão 1 inserida como publicada.');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
```

⚠️ **`arquivos` entra como objeto simples**, não `Map`: o driver nativo não conhece o `Map` do
Mongoose, e um `@Prop({type: Map})` lê um subdocumento comum sem problema. Inserir um `Map` pelo driver
gravaria `{}`.

⚠️ **O nome da coleção é `cadernotemplates`** — a pluralização automática do Mongoose para
`CadernoTemplate`. Confirme no gate da Task 8 antes de rodar em homologação; errar aqui cria uma
coleção órfã e o `GET /template` continua devolvendo 503.

- [ ] **Step 2: Registrar o script**

Em `package.json`, junto do `backfill:criador-id`:

```json
"seed:template-caderno": "ts-node scripts/seed-template-caderno.ts",
```

- [ ] **Step 3: Provar que o lint do seed não é decorativo**

```bash
npx ts-node -T --compiler-options '{"module":"commonjs"}' -e "
const fs=require('fs'), path=require('path');
const {lintarTemplate}=require('./src/modules/caderno/template/template-lint');
const dir='src/modules/caderno/templates/v1';
const ok={
  'main.tex': fs.readFileSync(path.join(dir,'main.tex'),'utf-8'),
  'preambulo.tex': fs.readFileSync(path.join(dir,'preambulo.tex'),'utf-8'),
};
console.log('repo real  ->', JSON.stringify(lintarTemplate(ok)));
const quebrado={...ok, 'main.tex': ok['main.tex'].replace('\\\\input{conteudo}','% \\\\input{conteudo}')};
console.log('comentado  ->', lintarTemplate(quebrado).podePublicar, '<- precisa ser false');
"
```

Esperado: o real com `erros: []`, `avisos: []`, `podePublicar: true`; o comentado, `false`.

⚠️ Se o real produzir **aviso**, pare e reporte: a spec afirma que ele passa limpo nas oito, e a lista
de macros (quatro, incluindo `\cadernoPendencias`) é o ponto onde isso escorrega.

- [ ] **Step 4: Rodar contra um Mongo local, duas vezes**

```bash
MONGODB="mongodb://localhost:27017/ms-simulado-seed-test" npx ts-node scripts/seed-template-caderno.ts
MONGODB="mongodb://localhost:27017/ms-simulado-seed-test" npx ts-node scripts/seed-template-caderno.ts
```

Esperado: a primeira insere; a segunda diz `Já existem 1 versão(ões)`.

Confira que o conteúdo bateu byte a byte:

```bash
mongosh "mongodb://localhost:27017/ms-simulado-seed-test" --quiet --eval '
  const d = db.cadernotemplates.findOne();
  print("versao:", d.versao, "status:", d.status, "criador:", d.criadorId);
  print("main.tex bytes:", d.arquivos["main.tex"].length);
  print("preambulo.tex bytes:", d.arquivos["preambulo.tex"].length);
'
wc -c src/modules/caderno/templates/v1/main.tex src/modules/caderno/templates/v1/preambulo.tex
```

⚠️ Os números do `wc -c` e do `.length` **não vão bater** se houver acento: `wc -c` conta bytes,
`.length` conta unidades UTF-16. Compare o `main.tex` **pelo conteúdo**, não pelo tamanho, se divergir.

E limpe:

```bash
mongosh "mongodb://localhost:27017/ms-simulado-seed-test" --quiet --eval 'db.dropDatabase()'
```

- [ ] **Step 5: Commit**

```bash
npx prettier --write scripts/seed-template-caderno.ts
npx eslint scripts/seed-template-caderno.ts
git add scripts/seed-template-caderno.ts package.json
git commit -m "$(cat <<'EOF'
feat(caderno): seed da versao 1 do template

Le main.tex e preambulo.tex do repo e insere como versao 1 publicada,
criadorId 'system'. Idempotente: com qualquer versao ja no banco, sai
sem escrever.

Passa pelo PROPRIO lint antes de inserir. Um seed que entra sem passar
pela regua que todos os outros uploads passam e uma excecao que ninguem
lembra depois -- e e justamente a versao que o "restaurar" traz de
volta.

Fica em scripts/, nao em scripts/migrations/ como o card diz: aquele
diretorio e shell + mongosh, e este seed precisa ler arquivos do repo e
valida-los. O molde e o backfill-criador-id.ts, precedente de seed em TS
neste repo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: GATE MANUAL — o que só o Mongo de verdade prova

⚠️ **PARE AQUI E ESPERE O USUÁRIO.** Não siga para a Task 9 sem a resposta dele.

Três coisas do card **não têm como ser provadas** pelos testes das tasks anteriores, e é honesto dizer
por quê:

| o que falta provar | por que não dá em teste unitário |
|---|---|
| o índice parcial realmente impede dois rascunhos | índice declarado ≠ índice construído; só o Mongo aplica |
| a transação do publicar commita de verdade | precisa de replica set; o `mongo:7` do CI é **standalone** |
| o zip real do Overleaf extrai os dois arquivos | o fixture é um zip que **eu** montei, não um que o Overleaf gerou |

O CI roda `yarn test`, que é `jest` com `rootDir: src` — os `test/*.e2e-spec.ts` **não** rodam nele.
Então este arquivo é deliberadamente opt-in.

**Files:**
- Create: `test/caderno-template.e2e-spec.ts`

- [ ] **Step 1: Escrever o e2e opt-in**

No molde do `test/categoria-schema-extension.e2e-spec.ts`, com `MONGODB` caindo em
`mongodb://localhost:27017/ms-simulado-test`. Ele cobre, contra Mongo real:

1. `createIndexes()` e então **dois `criarRascunho` concorrentes** via `Promise.all` — um resolve, o
   outro rejeita com `E11000`. ⚠️ Concorrentes, não sequenciais: sequencial passa mesmo sem índice, se
   o código checar antes.
2. publicar com uma publicada existente → a anterior vira `arquivada`, a nova tem `versao = max+1` e
   `publicadaEm` preenchido
3. restaurar a v2 → rascunho com `origemVersao: 2`; publicar gera v4
4. o seed rodado duas vezes não duplica

⚠️ **O item 2 exige replica set.** Num Mongo standalone o `startTransaction` lança
`Transaction numbers are only allowed on a replica set member or mongos`. O teste deve falhar com essa
mensagem, **não** ser pulado por um `describe.skip` condicional: um teste que se auto-pula quando o
ambiente não serve é um teste que nunca reprova nada. Deixe no topo do arquivo a linha para subir um:

```bash
docker run -d --name mongo-rs -p 27017:27017 mongo:7 --replSet rs0
docker exec mongo-rs mongosh --quiet --eval 'rs.initiate()'
```

⚠️ **Não aponte o `MONGODB` para homologação.** Todo `.env` deste checkout aponta para lá, e este spec
**escreve e apaga**. Passe a URI explicitamente na linha de comando.

- [ ] **Step 2: Rodar**

```bash
docker run -d --name mongo-rs -p 27018:27017 mongo:7 --replSet rs0
docker exec mongo-rs mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27018"}]})'
MONGODB="mongodb://localhost:27018/ms-simulado-test?directConnection=true" npx jest --config ./test/jest-e2e.json --detectOpenHandles --forceExit test/caderno-template.e2e-spec.ts
docker rm -f mongo-rs
```

Registre o resultado real. Se algo falhar, **conserte antes do gate** — o gate é para o usuário
validar o produto, não para ele descobrir teste vermelho.

- [ ] **Step 3: Parar e apresentar ao usuário**

Apresente, nesta ordem:

1. **O que os testes provam** — as contagens reais de cada spec, não "todos passando"
2. **O que o e2e provou** — os quatro itens, com o resultado de cada
3. **O que continua sem prova**: o zip real do Overleaf. Peça a ele para baixar um projeto de lá e
   subir, ou para mandar o zip
4. **A pergunta do deploy**: o seed roda em homologação **antes** ou **depois** do merge? Ele muda a
   fonte da verdade do template, mas só a partir do card 11 — hoje ninguém lê do Mongo, então rodar
   antes é seguro e deixa o banco pronto
5. **O que o card 11 vai precisar**: `CadernoTemplateService.publicada()` já exportado pelo módulo

⚠️ **Não abra o PR antes desta resposta.**

---

### Task 9: fechamento

**Files:** nenhum novo — verificação e PR.

- [ ] **Step 1: Cobertura em `template/`**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='src/modules/caderno/template/**/*.ts' src/modules/caderno/template/
```

Critério do card: **≥ 90%** em `template/`. Se faltar, olhe **o que** está descoberto antes de
escrever teste: linha de `catch` que nenhum caminho real alcança não vale um teste; regra de lint sem
teste, vale.

- [ ] **Step 2: A suíte inteira, para garantir que nada quebrou**

```bash
npx jest --detectOpenHandles --forceExit
```

⚠️ Este card não toca em nada existente, então a expectativa é **zero** regressão. Qualquer teste
vermelho fora de `template/` é problema desta branch até prova em contrário.

- [ ] **Step 3: Build**

```bash
yarn build && ls -la dist/main.js && ls dist/modules/caderno/template/
```

⚠️ `dist/main.js` **na raiz**. Se ele foi para `dist/src/main.js`, algum `.ts` fora de `src/` entrou no
build — provavelmente o seed. O `scripts/` já está no `exclude` do `tsconfig.build.json`; não o remova
de lá.

⚠️ Confira também que `dist/modules/caderno/templates/v1/` continua com os `.tex` — o card 11 ainda
não existe, então o zip da prova segue lendo do disco.

- [ ] **Step 4: Revisar o próprio diff**

```bash
git log --oneline develop..HEAD
git diff develop...HEAD --stat
```

Procure especificamente: `console.log` esquecido, `.only` em algum `describe`/`it`, arquivo de
`node_modules` ou `.env` no diff, e mudança em arquivo fora de `src/modules/caderno/template/`,
`scripts/`, `test/`, `src/app.module.ts`, `package.json` e `yarn.lock`.

- [ ] **Step 5: Abrir o PR**

⚠️ **Base `develop`.** Esta branch saiu da `develop` atualizada — a POC acabou, e a instrução vale
daqui em diante.

```bash
git push -u origin feature/caderno-10-template-mongo
gh pr create --base develop --title "feat(caderno): template versionado no Mongo (card 10)" --body "$(cat <<'EOF'
## O que muda

Tira o layout do caderno do repositório e põe no Mongo, versionado, com upload, publicação e lint.
Mudar a capa deixa de exigir PR, review e deploy.

**Muda uma decisão do card 00.** Lá a fonte da verdade era "o repo, e só ele". Passa a ser: o repo é o
seed; depois da migração, o Mongo manda. Os `.tex` continuam em `templates/v1/` como semente,
referência de dev e cópia de resgate.

⚠️ **Não muda a geração do zip da prova** — isso é o card 11. Hoje o zip continua lendo do disco, e
isso não abre janela ruim: sem os cards 12 e 13 ninguém alcança estes endpoints para publicar nada.

## Onde está o risco, e o que foi feito com ele

Isto dá a um não-desenvolvedor o poder de parar a geração de prova para todo mundo, sem compilador
para barrar. As travas que tornam isso aceitável são o lint bloqueante, a imutabilidade das publicadas
e o restaurar de um clique. As duas primeiras estão aqui, e estão testadas.

**A limpeza de comentários é load-bearing, e erra nos dois sentidos.** Não remover: um
`\input{conteudo}` comentado passa no lint e a prova compila perfeitamente **sem nenhuma questão** —
não é hipótese, o `main.tex` de hoje já tem um `\input{preambulo}` dentro de comentário na linha 16.
Remover errado, ignorando o `\%`, bloqueia um template bom depois de a pessoa ter visto o PDF compilar
no Overleaf. Virou peça própria, com spec própria.

**Chave desbalanceada avisa, não bloqueia.** É a única das oito regras que pode dar falso positivo em
LaTeX válido, e o fluxo já garante uma compilação real no Overleaf antes do upload.

**Erro de lint no upload devolve 200 com os erros**, não 4xx: o rascunho é salvo e a pessoa não perde
o zip. Quem recusa é o publicar, com 409.

**Publicar arquiva antes de promover.** Um estado intermediário de "zero publicadas" devolve 503 —
visível, e republicar conserta. Um de "duas publicadas" é ambíguo, que é o que este card evita.

## O que NÃO está coberto por teste automatizado, e por quê

Não existe `mongodb-memory-server` neste repo, e o `yarn test` do CI roda só `src/**/*.spec.ts` — os
`test/*.e2e-spec.ts` não rodam nele. Então o índice parcial em ação e a transação do publicar estão
num e2e opt-in (`test/caderno-template.e2e-spec.ts`), rodado à mão contra um replica set local. O
`mongo:7` do CI é standalone e não suporta transação.

O resultado dessa execução está no comentário abaixo.

## Deploy

`yarn seed:template-caderno` com `MONGODB` apontando pro banco alvo. Idempotente. Pode rodar antes do
merge: hoje ninguém lê o template do Mongo.

EOF
)"
```

- [ ] **Step 6: Comentar no PR o resultado real do gate**

Cole no PR a saída da Task 8 — as contagens de teste e os quatro itens do e2e. ⚠️ Números medidos, não
"tudo passando".

---

## Resumo do que este plano decide, e por quê

| decisão | motivo |
|---|---|
| limpeza de comentários é peça própria | três regras dependem dela e ela erra nos dois sentidos |
| chave desbalanceada avisa | única regra que pode reprovar LaTeX válido; o Overleaf já compilou |
| `\input{sub/arquivo}` passa | a regra é sobre **sair** do diretório, não sobre ter barra |
| limites antes do `loadAsync` | recusar depois de descompactar é o zip bomb funcionando |
| `TextDecoder({fatal:true})` | `toString('utf-8')` troca byte inválido por `U+FFFD` calado |
| nome ruim rejeita o zip inteiro | path traversal na montagem do zip da prova, no card 11 |
| todo filtro de escrita carrega o status | é o que torna a publicada imutável de verdade |
| `maiorVersao()` olha todos os status | filtrar reaproveitaria número e explodiria o índice único |
| arquivar antes de promover | torna o estado intermediário visível em vez de ambíguo |
| 200 com erros no upload | ninguém perde o zip que acabou de editar no Overleaf |
| 503 em vez de cair no disco | fallback silencioso reintroduz a dúvida sobre qual é a atual |
| seed em `scripts/`, não `scripts/migrations/` | aquele diretório é shell+mongosh; este seed lê o repo e lint-a |
| seed passa pelo próprio lint | é a versão que o "restaurar" traz de volta |
| e2e opt-in, e não fingido | não há mongodb-memory-server e o CI não roda `test/` |
