# Caderno · Overleaf — Card 04: endpoint e zip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o zip do caderno por HTTP, juntando gerador, resolvedor de imagens e template numa coisa só que o Overleaf abre e compila.

**Architecture:** Um serviço que orquestra as peças já prontas dos cards 02 e 03, com três funções puras ao lado (nome do arquivo, merge de avisos, montagem do zip) e um controller fino no padrão do `cartao-resposta`.

**Tech Stack:** NestJS 10, TypeScript (CommonJS), Jest 29. **Uma dependência nova: `jszip`.**

**Spec:** `docs/superpowers/specs/2026-09-08-caderno-overleaf-endpoint-zip-design.md`

---

## Contexto que o plano assume

**Os cards 02 e 03 estão prontos e mergeados.** Este card não implementa geração nem busca de imagem:
chama `gerarCaderno` e `ResolverDeImagens.resolver`.

**O endpoint tem UM portão, e é `simulado.bloqueado`.** O card original pedia também um `422` para
"nenhuma questão renderizável" — **saiu**. O endpoint não audita propriedade interna do simulado para
decidir se ele merece virar caderno; quem decide isso é o fluxo que **calcula** `bloqueado`. Sem o
`422`, o gerador emite a questão-marcador do card 02, o zip compila, e o endpoint não opina.

**Não existe distribuição TeX nesta máquina.** Nunca tente compilar. O gate é manual (Task 8) e para
esperando o usuário.

## Restrições do repo

- ⚠️ **Nunca** `yarn lint` nem `npx eslint <diretório>`: reformata arquivos não relacionados. Sempre caminhos explícitos.
- ⚠️ **Nunca** `git add -A` nem `git add .`.
- Jest: `npx jest --detectOpenHandles --forceExit <caminho>`
- ⚠️ `tsconfig.json` tem `strictNullChecks: false` (ao lado de `strict: true`, e o `false` vence). O TS **não estreita união discriminada por negação**: use `x.ok === false`, não `!x.ok`. Função aninhada em object literal de teste pode precisar de anotação explícita de retorno.
- Branch `feature/caderno-04-endpoint-zip`, já criada. Commits autônomos liberados.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/nome-do-arquivo.ts` | slug + timestamp. Puro. |
| `src/modules/caderno/avisos.ts` | juntar as duas listas no topo do `conteudo.tex`. Puro. |
| `src/modules/caderno/zip.ts` | montar o pacote com `jszip`. |
| `src/modules/caderno/caderno.service.ts` | portão → gerador → resolver → avisos → zip |
| `src/modules/caderno/caderno.controller.ts` | controller fino, padrão do `cartao-resposta` |
| `src/modules/caderno/caderno.module.ts` | wiring |

---

### Task 1: `jszip` e o nome do arquivo

**Files:**
- Modify: `package.json`
- Create: `src/modules/caderno/nome-do-arquivo.spec.ts`
- Create: `src/modules/caderno/nome-do-arquivo.ts`

- [ ] **Step 1: Instalar a dependência**

```bash
yarn add jszip
node -p "require('jszip/package.json').version"
```

⚠️ **Só `jszip`.** Se o `yarn` quiser atualizar outra coisa no `yarn.lock`, confira o diff antes de
commitar e **reporte** se ele mexer em pacote que não seja `jszip` e suas dependências.

⚠️ `jszip` traz tipos próprios; **não** instale `@types/jszip`, que é um pacote stub obsoleto.

- [ ] **Step 2: Escrever o teste que falha**

Criar `src/modules/caderno/nome-do-arquivo.spec.ts`:

```ts
import { nomeDoArquivo, slugDoSimulado } from './nome-do-arquivo';

describe('slugDoSimulado', () => {
  it('tira acento, baixa a caixa e troca o resto por hífen', () => {
    expect(slugDoSimulado('Simulão de Novembro!', 'abc123')).toBe(
      'simulao-de-novembro',
    );
    expect(slugDoSimulado('ENEM 1º dia — 2026', 'abc123')).toBe(
      'enem-1o-dia-2026',
    );
  });

  it('colapsa hífens e apara as pontas', () => {
    expect(slugDoSimulado('  ///Prova///  ', 'abc123')).toBe('prova');
    expect(slugDoSimulado('a...b', 'abc123')).toBe('a-b');
  });

  it('cai no simuladoId quando o nome saneia para vazio', () => {
    // Nome de simulado aceita acento, barra e dois-pontos, e nem todo sistema
    // de arquivos aceita. Um nome só de símbolos produziria um arquivo sem
    // nome nenhum.
    expect(slugDoSimulado('!!!', 'abc123')).toBe('abc123');
    expect(slugDoSimulado('', 'abc123')).toBe('abc123');
    expect(slugDoSimulado('   ', 'abc123')).toBe('abc123');
  });

  it('o resultado é sempre [a-z0-9-]', () => {
    for (const nome of [
      'Simulão!! de Nôvembro/2026',
      'ção çedilha ünïcode',
      'A:B\\C|D*E?F"G<H>I',
      '日本語',
    ]) {
      expect(slugDoSimulado(nome, 'abc123')).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('nomeDoArquivo', () => {
  it('junta slug, timestamp e extensão', () => {
    const nome = nomeDoArquivo(
      'Simulado de Novembro',
      'abc123',
      new Date('2026-09-08T14:32:07Z'),
    );
    expect(nome).toMatch(/^simulado-de-novembro-\d{8}-\d{4}\.zip$/);
  });

  it('o timestamp diferencia dois downloads seguidos', () => {
    // Não versiona nada no servidor: não guardamos zip, cada requisição
    // regenera. Serve para o download não virar `caderno (1).zip` na máquina
    // de quem baixou.
    const a = nomeDoArquivo('P', 'id', new Date('2026-09-08T14:32:00Z'));
    const b = nomeDoArquivo('P', 'id', new Date('2026-09-08T15:01:00Z'));
    expect(a).not.toBe(b);
  });

  it('nome impróprio não escapa para o Content-Disposition', () => {
    // O nome vai num header HTTP. Aspas ou quebra de linha ali permitiriam
    // injetar outro header.
    const nome = nomeDoArquivo('a"b\nc', 'id', new Date());
    expect(nome).toMatch(/^[a-z0-9-]+-\d{8}-\d{4}\.zip$/);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/nome-do-arquivo.spec.ts
```

Esperado: FAIL — `Cannot find module './nome-do-arquivo'`.

- [ ] **Step 4: Implementar**

`src/modules/caderno/nome-do-arquivo.ts`:

```ts
/**
 * O nome com que o zip chega na máquina de quem baixou.
 *
 * ⚠️ Este valor vai para o header `Content-Disposition`. Aspas ou quebra de
 * linha ali permitiriam injetar outro header, então o resultado é restrito a
 * `[a-z0-9-]` por construção, e não por escape.
 */

/**
 * ⚠️ **O fallback para o `simuladoId` não é preciosismo.** Nome de simulado
 * aceita acento, barra, dois-pontos e emoji, e um nome só de símbolos sanearia
 * para string vazia — o usuário receberia um arquivo chamado `-20260908.zip`.
 */
export function slugDoSimulado(nome: string, simuladoId: string): string {
  const slug = (nome ?? '')
    .normalize('NFD')
    // Remove os diacríticos que o NFD separou das letras.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || simuladoId;
}

/**
 * O timestamp **não versiona nada no servidor**: não guardamos zip nenhum,
 * cada requisição regenera. Ele existe para dois downloads não virarem
 * `caderno.zip` e `caderno (1).zip`, que não dizem qual é o mais novo.
 */
export function nomeDoArquivo(
  nome: string,
  simuladoId: string,
  agora: Date = new Date(),
): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const carimbo =
    `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}` +
    `-${p(agora.getHours())}${p(agora.getMinutes())}`;

  return `${slugDoSimulado(nome, simuladoId)}-${carimbo}.zip`;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/nome-do-arquivo.spec.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 6: Provar que o fallback morde**

Troque `return slug || simuladoId;` por `return slug;` e confirme que
`cai no simuladoId quando o nome saneia para vazio` fica vermelho. Restaure.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/modules/caderno/nome-do-arquivo.ts src/modules/caderno/nome-do-arquivo.spec.ts
npx eslint src/modules/caderno/nome-do-arquivo.ts src/modules/caderno/nome-do-arquivo.spec.ts
git add package.json yarn.lock src/modules/caderno/nome-do-arquivo.ts src/modules/caderno/nome-do-arquivo.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): nome do arquivo do zip, e a dependencia jszip

O nome vai no Content-Disposition: aspas ou quebra de linha ali
permitiriam injetar outro header, entao o resultado e restrito a
[a-z0-9-] por construcao, nao por escape.

Fallback pro simuladoId porque nome de simulado aceita acento, barra e
emoji -- um nome so de simbolos sanearia pra vazio e o usuario receberia
um arquivo chamado "-20260908.zip".

O timestamp nao versiona nada no servidor: nao guardamos zip, cada
requisicao regenera. Serve pra dois downloads nao virarem caderno.zip e
caderno (1).zip.

jszip e a primeira dependencia nova desta POC. Zip escrito a mao falharia
so no Overleaf, longe do teste, e o gate aqui e manual.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 2: `avisos.ts` — juntar as duas listas

**Files:**
- Create: `src/modules/caderno/avisos.spec.ts`
- Create: `src/modules/caderno/avisos.ts`

Esta task fecha a lacuna que o gate do card 03 revelou: os avisos do resolvedor não são escritos em
lugar nenhum, e o `LEIA-ME.txt` já promete que essas linhas existem.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/avisos.spec.ts`:

```ts
import { juntarAvisos } from './avisos';

const CONTEUDO_SEM_AVISO = `\\needspace{10\\baselineskip}
\\setcounter{question}{45}
\\question
Enunciado.
`;

const CONTEUDO_COM_AVISO = `% AVISO: questão 47 — alternativa C está em branco

\\needspace{10\\baselineskip}
\\setcounter{question}{45}
\\question
Enunciado.
`;

describe('juntarAvisos', () => {
  it('junta as duas listas no topo, card 02 primeiro', () => {
    const r = juntarAvisos(CONTEUDO_COM_AVISO, [
      'assets/03 — imagem não encontrada no acervo',
    ]);
    expect(r).toBe(
      `% AVISO: questão 47 — alternativa C está em branco
% AVISO: assets/03 — imagem não encontrada no acervo

\\needspace{10\\baselineskip}
\\setcounter{question}{45}
\\question
Enunciado.
`,
    );
  });

  it('cria o bloco quando só o card 03 avisou', () => {
    const r = juntarAvisos(CONTEUDO_SEM_AVISO, ['assets/01 — imagem grande demais']);
    expect(r.startsWith('% AVISO: assets/01 — imagem grande demais\n\n')).toBe(true);
    expect(r).toContain('\\needspace');
  });

  it('sem aviso nenhum, não há bloco e o conteúdo não muda', () => {
    expect(juntarAvisos(CONTEUDO_SEM_AVISO, [])).toBe(CONTEUDO_SEM_AVISO);
  });

  it('preserva o bloco do card 02 quando o card 03 não avisou', () => {
    expect(juntarAvisos(CONTEUDO_COM_AVISO, [])).toBe(CONTEUDO_COM_AVISO);
  });

  it('achata quebra de linha dentro do aviso', () => {
    // ⚠️ Uma quebra de linha ENCERRA o comentário LaTeX e joga o resto do
    // aviso dentro do documento, impresso na prova do aluno.
    const r = juntarAvisos(CONTEUDO_SEM_AVISO, ['assets/01 —\nfalhou feio']);
    expect(r.split('\n').filter((l) => l.startsWith('% AVISO:'))).toHaveLength(1);
    expect(r).toContain('% AVISO: assets/01 — falhou feio');
  });

  it('não se confunde com "% AVISO:" no meio do documento', () => {
    // Se uma questão tiver essa string no próprio texto, inserir "no topo"
    // procurando a marca acertaria o lugar errado. Por isso a operação é
    // remover o bloco de ABERTURA e prefixar, nunca inserir no meio.
    const comArmadilha = `% AVISO: questão 47 — alternativa C está em branco

\\question
O aluno leu: % AVISO: isto faz parte do enunciado
`;
    const r = juntarAvisos(comArmadilha, ['assets/01 — falhou']);
    const linhas = r.split('\n');
    expect(linhas[0]).toBe('% AVISO: questão 47 — alternativa C está em branco');
    expect(linhas[1]).toBe('% AVISO: assets/01 — falhou');
    expect(linhas[2]).toBe('');
    expect(r).toContain('O aluno leu: % AVISO: isto faz parte do enunciado');
  });

  it('conta os avisos das duas listas', () => {
    const { total } = juntarAvisos.comTotal(CONTEUDO_COM_AVISO, ['a', 'b']);
    expect(total).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/avisos.spec.ts
```

Esperado: FAIL — `Cannot find module './avisos'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/avisos.ts`:

```ts
/**
 * Junta os avisos dos dois cards no topo do `conteudo.tex`.
 *
 * ⚠️ **Por que isto existe:** o bloco `% AVISO:` é escrito pelo card 02, que
 * roda **antes** da resolução das imagens. Os avisos do card 03 — imagem não
 * encontrada, endereço recusado, formato não suportado — saem no retorno do
 * resolvedor e, sem esta função, não seriam escritos em lugar nenhum.
 *
 * O `LEIA-ME.txt` já promete essas linhas, e já explica que uma caixa cinza no
 * lugar da figura tem o motivo numa delas. A promessa está publicada; isto é a
 * entrega.
 */

const MARCA = '% AVISO: ';

/**
 * ⚠️ Quebra de linha dentro de um aviso **encerra o comentário** e joga o resto
 * dentro do documento, impresso na prova.
 */
const umaLinhaSo = (texto: string): string =>
  texto.replace(/[\r\n]+/g, ' ').trim();

/**
 * Separa o bloco de abertura do resto.
 *
 * ⚠️ **Remove e reescreve, nunca insere no meio.** Se uma questão contiver a
 * string `% AVISO:` no próprio texto, procurar a marca para inserir "no topo"
 * acertaria o lugar errado — e o aviso sairia impresso no meio da prova.
 */
function separar(conteudo: string): { avisos: string[]; corpo: string } {
  const linhas = conteudo.split('\n');
  const avisos: string[] = [];

  let i = 0;
  while (i < linhas.length && linhas[i].startsWith(MARCA)) {
    avisos.push(linhas[i].slice(MARCA.length));
    i += 1;
  }

  // A linha em branco que fecha o bloco também sai: ela é reposta ao remontar.
  if (avisos.length && linhas[i] === '') i += 1;

  return { avisos, corpo: linhas.slice(i).join('\n') };
}

function montar(todos: string[], corpo: string): string {
  if (!todos.length) return corpo;
  const bloco = todos.map((a) => `${MARCA}${umaLinhaSo(a)}`).join('\n');
  return `${bloco}\n\n${corpo}`;
}

export function juntarAvisos(
  conteudo: string,
  avisosDasImagens: string[],
): string {
  const { avisos, corpo } = separar(conteudo);
  return montar([...avisos, ...avisosDasImagens], corpo);
}

/** O mesmo, mais o total — que vai no header `X-Caderno-Avisos`. */
juntarAvisos.comTotal = (
  conteudo: string,
  avisosDasImagens: string[],
): { conteudo: string; total: number } => {
  const { avisos, corpo } = separar(conteudo);
  const todos = [...avisos, ...avisosDasImagens];
  return { conteudo: montar(todos, corpo), total: todos.length };
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/avisos.spec.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Provar que duas decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| trocar `separar` por um `indexOf(MARCA)` que insere no meio | `não se confunde com "% AVISO:" no meio do documento` |
| tirar o `umaLinhaSo` | `achata quebra de linha dentro do aviso` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/avisos.ts src/modules/caderno/avisos.spec.ts
npx eslint src/modules/caderno/avisos.ts src/modules/caderno/avisos.spec.ts
git add src/modules/caderno/avisos.ts src/modules/caderno/avisos.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): juntar os avisos dos cards 02 e 03 no topo do conteudo.tex

Fecha a lacuna que o gate do card 03 revelou: o bloco % AVISO: e escrito
pelo card 02, que roda ANTES da resolucao das imagens, entao os avisos do
resolvedor nao eram escritos em lugar nenhum. O LEIA-ME ja promete essas
linhas e ja explica que a caixa cinza tem motivo numa delas -- promessa
publicada, entrega faltando.

Remove o bloco de abertura e reescreve, nunca insere no meio: uma questao
que contenha "% AVISO:" no proprio texto faria a insercao acertar o lugar
errado, e o aviso sairia impresso no meio da prova.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 3: `zip.ts` — montar o pacote

**Files:**
- Create: `src/modules/caderno/zip.spec.ts`
- Create: `src/modules/caderno/zip.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/zip.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ARQUIVOS_DO_ZIP, TEMPLATE_DIR } from './templates';
import { montarZip } from './zip';

const abrir = async (buffer: Buffer) => JSZip.loadAsync(buffer);

const pacote = () =>
  montarZip({
    conteudo: '% AVISO: um\n\n\\question Teste\n',
    metadados: '\\def\\cadernoTitulo{Teste}\n',
    imagens: [
      { nome: 'assets/01.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { nome: 'assets/02.jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) },
    ],
  });

describe('montarZip — estrutura', () => {
  it('tem raiz plana, com assets/ como única subpasta', async () => {
    const zip = await abrir(await pacote());
    const nomes = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(nomes).toEqual([
      'LEIA-ME.txt',
      'assets/01.png',
      'assets/02.jpeg',
      'conteudo.tex',
      'logo.png',
      'main.tex',
      'metadados.tex',
      'preambulo.tex',
    ]);
  });

  it('os arquivos do template são byte-idênticos ao repo', async () => {
    // O template é a fonte da verdade do layout. Se o zip levar uma cópia
    // divergente, o usuário ajusta no Overleaf uma coisa que não é a que está
    // versionada.
    const zip = await abrir(await pacote());
    for (const arquivo of ARQUIVOS_DO_ZIP) {
      const noZip = await zip.file(arquivo)!.async('nodebuffer');
      const noRepo = fs.readFileSync(path.join(TEMPLATE_DIR, arquivo));
      expect(noZip.equals(noRepo)).toBe(true);
    }
  });

  it('leva o conteudo.tex e o metadados.tex gerados', async () => {
    const zip = await abrir(await pacote());
    expect(await zip.file('conteudo.tex')!.async('string')).toContain(
      '% AVISO: um',
    );
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      'cadernoTitulo',
    );
  });

  it('não leva o exemplo/ do smoke test', async () => {
    // ⚠️ O `exemplo/` do card 00 são questões SINTÉTICAS, escritas à mão para
    // provar que o template compila. Vazar para o zip entregaria essas
    // questões junto com as reais, na prova do aluno.
    const zip = await abrir(await pacote());
    const nomes = Object.keys(zip.files);
    expect(nomes.some((n) => n.includes('exemplo'))).toBe(false);
  });

  it('sem imagem nenhuma, ainda monta', async () => {
    const buffer = await montarZip({
      conteudo: '\\question Teste\n',
      metadados: '\\def\\cadernoTitulo{T}\n',
      imagens: [],
    });
    const zip = await abrir(buffer);
    expect(zip.file('main.tex')).not.toBeNull();
    expect(
      Object.keys(zip.files).some((n) => n.startsWith('assets/')),
    ).toBe(false);
  });
});

describe('montarZip — o conteúdo chega inteiro', () => {
  it('as imagens saem com os bytes que entraram', async () => {
    const zip = await abrir(await pacote());
    const png = await zip.file('assets/01.png')!.async('nodebuffer');
    expect(png.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });

  it('o UTF-8 do conteudo.tex sobrevive', async () => {
    // Acento e cedilha estão em todo enunciado. Um zip que grave latin-1
    // entregaria "questÃ£o" na prova.
    const buffer = await montarZip({
      conteudo: 'A resistência é 100\\% da questão — ação\n',
      metadados: '\\def\\cadernoTitulo{Ação}\n',
      imagens: [],
    });
    const zip = await abrir(buffer);
    expect(await zip.file('conteudo.tex')!.async('string')).toBe(
      'A resistência é 100\\% da questão — ação\n',
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/zip.spec.ts
```

Esperado: FAIL — `Cannot find module './zip'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/zip.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ArquivoDoZip } from './imagens/tipos';
import { ARQUIVOS_DO_ZIP, TEMPLATE_DIR } from './templates';

/**
 * Monta o pacote que o usuário sobe no Overleaf.
 *
 * ⚠️ **Raiz plana.** Os `\input{preambulo}`, `\input{metadados}` e o
 * `\includegraphics{logo.png}` do `main.tex` resolvem relativo a ele, então os
 * arquivos do template ficam lado a lado. `assets/` é a única subpasta.
 *
 * ⚠️ **`TEMPLATE_DIR` é importado, nunca recalculado.** Um
 * `path.join(__dirname, 'templates/v1')` daqui resolveria para outro lugar, e o
 * teste do card 00 **não pegaria** — o `__dirname` dele é o do próprio spec.
 * Ver o docblock de `templates.ts`.
 *
 * ⚠️ **O template vem do repo a cada geração.** É o que impede deriva: ninguém
 * ajusta layout num projeto do Overleaf e esquece de trazer de volta, porque a
 * próxima prova sai com o que está versionado.
 */

export interface PacoteDoCaderno {
  conteudo: string;
  metadados: string;
  imagens: ArquivoDoZip[];
}

export async function montarZip(pacote: PacoteDoCaderno): Promise<Buffer> {
  const zip = new JSZip();

  for (const arquivo of ARQUIVOS_DO_ZIP) {
    zip.file(arquivo, fs.readFileSync(path.join(TEMPLATE_DIR, arquivo)));
  }

  zip.file('conteudo.tex', pacote.conteudo);
  zip.file('metadados.tex', pacote.metadados);

  for (const imagem of pacote.imagens) {
    zip.file(imagem.nome, imagem.buffer);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}
```

⚠️ `ARQUIVOS_DO_ZIP` lista só os quatro arquivos do topo; o `exemplo/` **não** está lá. É por isso que
ele não vaza — e o teste afirma isso, em vez de confiar na lista.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/zip.spec.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Provar que duas decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| pôr os arquivos do template numa subpasta (`zip.folder('template')`) | `tem raiz plana` |
| ler um dos arquivos com `readFileSync(..., 'utf-8')` e gravar como string | `os arquivos do template são byte-idênticos` (o `logo.png` corrompe) |

A segunda merece atenção: ler PNG como texto **não lança**, e o zip sai com um `logo.png` de tamanho
parecido. O defeito só aparece na capa da prova.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
npx eslint src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
git add src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): montar o zip do caderno

Raiz plana: os \input e o \includegraphics{logo.png} do main.tex resolvem
relativo a ele. assets/ e a unica subpasta.

TEMPLATE_DIR e importado, nunca recalculado: um path.join(__dirname,...)
daqui resolveria pra outro lugar e o teste do card 00 nao pegaria, porque
o __dirname dele e o do proprio spec.

O template vem do repo a cada geracao, e e o que impede deriva -- ninguem
ajusta layout no Overleaf e esquece de trazer de volta.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 4: `CadernoService` — o portão e a orquestração

**Files:**
- Create: `src/modules/caderno/caderno.service.spec.ts`
- Create: `src/modules/caderno/caderno.service.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/caderno.service.spec.ts`:

```ts
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import JSZip from 'jszip';
import { CadernoService } from './caderno.service';

const simuladoPronto = (over: any = {}) => ({
  _id: 'sim1',
  nome: 'Simulado de Novembro',
  bloqueado: false,
  categoria: { nome: 'ENEM', duracao: 300, quantidadeTotalQuestao: 1 },
  questoes: [
    {
      numero: 1,
      questao: { status: 1, textoQuestao: 'E', pergunta: 'P', textoAlternativaA: 'a' },
    },
  ],
  ...over,
});

const montar = (over: any = {}) => {
  const simuladoService = {
    getById: jest.fn(async () => over.simulado ?? simuladoPronto()),
  };
  const resolver = {
    resolver: jest.fn(async () =>
      over.resolucao ?? {
        arquivos: [],
        avisos: [],
        metricas: {
          doCache: 0,
          doBucket: 0,
          daInternet: 0,
          falhas: 0,
          bytes: 0,
          ms: 0,
        },
      },
    ),
  };
  const env = { get: jest.fn(() => over.draftEnabled ?? true) };
  const service = new CadernoService(
    simuladoService as any,
    resolver as any,
    env as any,
  );
  return { service, simuladoService, resolver, env };
};

describe('CadernoService — o portão', () => {
  it('simulado inexistente → 404', async () => {
    const { service, simuladoService } = montar();
    simuladoService.getById = jest.fn(async () => null);
    await expect(service.gerarZip('sumiu', { draft: false })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('bloqueado sem draft → 409, com a mesma mensagem do cartão', async () => {
    // A mensagem é a mesma do TemplateProvisionService de propósito: duas
    // features que recusam pelo mesmo motivo não podem dizer coisas
    // diferentes.
    const { service } = montar({ simulado: simuladoPronto({ bloqueado: true }) });
    await expect(service.gerarZip('sim1', { draft: false })).rejects.toThrow(
      new ConflictException(
        'simulado não está pronto (questões pendentes ou incompletas)',
      ),
    );
  });

  it('bloqueado COM draft e flag ligada → gera', async () => {
    const { service } = montar({ simulado: simuladoPronto({ bloqueado: true }) });
    const r = await service.gerarZip('sim1', { draft: true });
    expect(r.buffer.length).toBeGreaterThan(0);
  });

  it('draft com a flag desligada → 403, mesmo com o simulado pronto', async () => {
    // Rascunho é ferramenta de quem monta a prova. Liberar isso por acidente
    // em produção entregaria caderno de simulado incompleto.
    const { service } = montar({ draftEnabled: false });
    await expect(service.gerarZip('sim1', { draft: true })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('desbloqueado → gera, sem olhar mais nada', async () => {
    const { service } = montar();
    const r = await service.gerarZip('sim1', { draft: false });
    expect(r.nome).toMatch(/^simulado-de-novembro-\d{8}-\d{4}\.zip$/);
  });

  it('simulado desbloqueado e SEM questão elegível → gera, não lança', async () => {
    // ⚠️ O card original pedia 422 aqui. Saiu: o endpoint tem UM portão, e é
    // `bloqueado`. Quem decide se um simulado está pronto é o fluxo que
    // CALCULA `bloqueado` — auditar isso aqui seria o caderno fiscalizando
    // trabalho alheio. O card 02 emite a questão-marcador e o zip compila.
    const { service } = montar({
      simulado: simuladoPronto({
        questoes: [],
        categoria: { nome: 'Custom', duracao: 60, quantidadeTotalQuestao: null },
      }),
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(await zip.file('conteudo.tex')!.async('string')).toContain(
      'nenhuma questão elegível',
    );
  });

  it('resolver lançando por QUESTAO_BUCKET ausente → 503', async () => {
    const { service, resolver } = montar();
    resolver.resolver = jest.fn(async () => {
      throw new Error('QUESTAO_BUCKET não configurado: não dá para ler imagens');
    });
    await expect(service.gerarZip('sim1', { draft: false })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('CadernoService — o que ele repassa', () => {
  it('repassa o draft ao gerador: rascunho liga a marca d’água', async () => {
    const { service } = montar({ simulado: simuladoPronto({ bloqueado: true }) });
    const r = await service.gerarZip('sim1', { draft: true });
    const zip = await JSZip.loadAsync(r.buffer);
    // ⚠️ `\cadernoRascunhotrue`, não `\def`: é um `\newif` do preambulo.tex, e
    // um `\def` não liga a marca d'água nem dá erro.
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      '\\cadernoRascunhotrue',
    );
  });

  it('no modo normal não há marca d’água', async () => {
    const { service } = montar();
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(await zip.file('metadados.tex')!.async('string')).not.toContain(
      'cadernoRascunho',
    );
  });

  it('junta os avisos dos dois cards e conta o total', async () => {
    const { service } = montar({
      simulado: simuladoPronto({
        questoes: [
          {
            numero: 1,
            questao: { status: 1, textoQuestao: 'E', pergunta: 'P' },
          },
        ],
      }),
      resolucao: {
        arquivos: [],
        avisos: ['assets/01 — imagem não encontrada no acervo'],
        metricas: {
          doCache: 0,
          doBucket: 0,
          daInternet: 0,
          falhas: 1,
          bytes: 0,
          ms: 0,
        },
      },
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');
    const linhas = conteudo.split('\n').filter((l) => l.startsWith('% AVISO:'));

    // 5 alternativas em branco (card 02) + 1 imagem (card 03)
    expect(linhas.length).toBe(r.avisos);
    expect(conteudo).toContain(
      '% AVISO: assets/01 — imagem não encontrada no acervo',
    );
  });

  it('as imagens resolvidas entram no zip', async () => {
    const { service } = montar({
      resolucao: {
        arquivos: [
          { nome: 'assets/01.png', buffer: Buffer.from([1, 2, 3]) },
        ],
        avisos: [],
        metricas: {
          doCache: 0,
          doBucket: 0,
          daInternet: 1,
          falhas: 0,
          bytes: 3,
          ms: 5,
        },
      },
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(zip.file('assets/01.png')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.service.spec.ts
```

Esperado: FAIL — `Cannot find module './caderno.service'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/caderno.service.ts`:

```ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnvService } from '../../shared/modules/env/env.service';
import { SimuladoService } from '../simulado/simulado.service';
import { juntarAvisos } from './avisos';
import { gerarCaderno } from './gerador/gerar-caderno';
import { SimuladoParaCaderno } from './gerador/tipos';
import { ResolverDeImagens } from './imagens/resolver';
import { nomeDoArquivo } from './nome-do-arquivo';
import { montarZip } from './zip';

/**
 * O caminho completo: portão → gerador → resolvedor → avisos → zip.
 *
 * ⚠️ **O endpoint tem UM portão, e é `simulado.bloqueado`.** Ele não inspeciona
 * propriedade interna do simulado para decidir se merece virar caderno: quem
 * decide se um simulado está pronto é o fluxo que **calcula** `bloqueado`.
 * Auditar isso aqui seria o caderno fiscalizando trabalho alheio — e mal,
 * porque ele não teria como saber se "zero questões" é defeito ou estado
 * válido daquela categoria.
 */

const MENSAGEM_BLOQUEADO =
  'simulado não está pronto (questões pendentes ou incompletas)';

@Injectable()
export class CadernoService {
  private readonly logger = new Logger(CadernoService.name);

  constructor(
    private readonly simuladoService: SimuladoService,
    private readonly resolver: ResolverDeImagens,
    private readonly env: EnvService,
  ) {}

  async gerarZip(
    simuladoId: string,
    opts: { draft: boolean },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }> {
    const inicio = Date.now();

    if (opts.draft && !this.env.get('CADERNO_DRAFT_ENABLED')) {
      throw new ForbiddenException('geração de rascunho desabilitada');
    }

    const simulado = await this.simuladoService.getById(simuladoId);
    if (!simulado) throw new NotFoundException('simulado não encontrado');

    // Mesma leitura e MESMA MENSAGEM do TemplateProvisionService: duas
    // features que recusam pelo mesmo motivo não podem divergir no texto.
    if (simulado.bloqueado && !opts.draft) {
      throw new ConflictException(MENSAGEM_BLOQUEADO);
    }

    const caderno = gerarCaderno(
      simulado as unknown as SimuladoParaCaderno,
      { draft: opts.draft },
    );

    let resolucao;
    try {
      resolucao = await this.resolver.resolver(caderno.imagens);
    } catch (erro) {
      // A única exceção que o resolvedor levanta é configuração ausente.
      // Seguir sem ela transformaria toda imagem em "não encontrada", que
      // manda procurar a imagem em vez da configuração.
      throw new ServiceUnavailableException((erro as Error).message);
    }

    const { conteudo, total } = juntarAvisos.comTotal(
      caderno.conteudo,
      resolucao.avisos,
    );

    const buffer = await montarZip({
      conteudo,
      metadados: caderno.metadados,
      imagens: resolucao.arquivos,
    });

    this.logger.log(
      `caderno ${simuladoId} draft=${opts.draft} ` +
        `questoes=${caderno.questoesIncluidas.length} ` +
        `imagens=${resolucao.arquivos.length} ` +
        `cache=${resolucao.metricas.doCache} bucket=${resolucao.metricas.doBucket} ` +
        `internet=${resolucao.metricas.daInternet} ` +
        `bytes=${buffer.length} avisos=${total} ms=${Date.now() - inicio}`,
    );

    return {
      nome: nomeDoArquivo(simulado.nome, simuladoId),
      buffer,
      avisos: total,
    };
  }
}
```

⚠️ O log inclui `cache`/`bucket`/`internet` de propósito: **essas métricas são a medição que decide o
card 07** (cache do artefato) e a volta do Redis. Sem elas no log, aquela decisão vira chute de novo.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.service.spec.ts
```

Esperado: PASS, 11 testes.

- [ ] **Step 5: Provar que quatro decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| checar a flag de draft **depois** do `getById` | nenhum — **e é o ponto:** veja abaixo |
| `simulado.bloqueado` sem o `&& !opts.draft` | `bloqueado COM draft e flag ligada → gera` |
| mudar o texto da `MENSAGEM_BLOQUEADO` | `409, com a mesma mensagem do cartão` |
| não passar `opts.draft` ao `gerarCaderno` | `repassa o draft ao gerador` |
| deixar a exceção do resolvedor subir crua | `resolver lançando por QUESTAO_BUCKET ausente → 503` |

⚠️ A primeira linha é uma armadilha de propósito: mover a checagem da flag **não** quebra teste nenhum,
porque nenhum teste combina flag desligada com simulado inexistente. **Não escreva teste novo para
ela** — só confirme e reporte. A ordem existe por gosto (falhar antes de ir ao banco), não por
correção, e um teste que trave gosto é ruído.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts
npx eslint src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts
git add src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): servico do caderno -- portao, orquestracao e zip

O endpoint tem UM portao, e e simulado.bloqueado. O 422 de "nenhuma
questao renderizavel" que o card pedia SAIU: quem decide se um simulado
esta pronto e o fluxo que CALCULA bloqueado, e auditar isso aqui seria o
caderno fiscalizando trabalho alheio -- sem ter como saber se zero
questoes e defeito ou estado valido daquela categoria.

Mesma mensagem de 409 do TemplateProvisionService: duas features que
recusam pelo mesmo motivo nao podem divergir no texto.

O log leva cache/bucket/internet de proposito: essas metricas sao a
medicao que decide o card 07 e a volta do Redis.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 5: Controller, módulo e a env

**Files:**
- Create: `src/modules/caderno/caderno.controller.ts`
- Create: `src/modules/caderno/caderno.controller.spec.ts`
- Create: `src/modules/caderno/caderno.module.ts`
- Modify: `src/shared/modules/env/env.ts`
- Modify: `.env.example`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/caderno.controller.spec.ts`:

```ts
import { CadernoController } from './caderno.controller';

const montar = (retorno: any = {}) => {
  const service = {
    gerarZip: jest.fn(async () => ({
      nome: 'prova-20260908-1432.zip',
      buffer: Buffer.from('zip'),
      avisos: 3,
      ...retorno,
    })),
  };
  const res = {
    set: jest.fn(),
  };
  return { controller: new CadernoController(service as any), service, res };
};

describe('CadernoController', () => {
  it('devolve o zip com o nome e a contagem de avisos nos headers', async () => {
    const { controller, res } = montar();
    const arquivo = await controller.getCaderno('sim1', undefined, res as any);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Disposition':
        'attachment; filename="prova-20260908-1432.zip"',
      'X-Caderno-Avisos': '3',
    });
    expect(await arquivo.getStream().read()).toEqual(Buffer.from('zip'));
  });

  it('sem ?draft, chama o serviço em modo normal', async () => {
    const { controller, service, res } = montar();
    await controller.getCaderno('sim1', undefined, res as any);
    expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: false });
  });

  it('?draft=true liga o rascunho', async () => {
    const { controller, service, res } = montar();
    await controller.getCaderno('sim1', 'true', res as any);
    expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: true });
  });

  it('só a string "true" liga o rascunho', async () => {
    // ⚠️ Query string chega como texto. Tratar "qualquer coisa presente" como
    // ligado faria `?draft=false` LIGAR o rascunho — e o defeito só apareceria
    // como uma marca d'água que ninguém pediu.
    const { controller, service, res } = montar();
    for (const valor of ['false', '0', '', 'sim', 'TRUE']) {
      await controller.getCaderno('sim1', valor, res as any);
    }
    expect(
      service.gerarZip.mock.calls.every((c: any[]) => c[1].draft === false),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.controller.spec.ts
```

Esperado: FAIL — `Cannot find module './caderno.controller'`.

- [ ] **Step 3: Implementar o controller**

`src/modules/caderno/caderno.controller.ts`:

```ts
import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CadernoService } from './caderno.service';

@ApiTags('caderno')
@Controller('v1/caderno')
export class CadernoController {
  constructor(private readonly caderno: CadernoService) {}

  @Get(':simuladoId')
  @Header('Content-Type', 'application/zip')
  async getCaderno(
    @Param('simuladoId') simuladoId: string,
    @Query('draft') draft: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // ⚠️ Só a string exata "true". Query string chega como texto, e tratar
    // "presente" como ligado faria `?draft=false` LIGAR o rascunho — defeito
    // que aparece como uma marca d'água que ninguém pediu.
    const { nome, buffer, avisos } = await this.caderno.gerarZip(simuladoId, {
      draft: draft === 'true',
    });

    res.set({
      'Content-Disposition': `attachment; filename="${nome}"`,
      'X-Caderno-Avisos': String(avisos),
    });

    return new StreamableFile(buffer);
  }
}
```

- [ ] **Step 4: A env, com a armadilha do boolean**

Em `src/shared/modules/env/env.ts`, acrescente ao schema:

```ts
  // Caderno · card 04. Rascunho é ferramenta de quem monta a prova; liberar
  // isso por acidente em produção entregaria caderno de simulado incompleto.
  //
  // ⚠️ NÃO use `z.coerce.boolean()`: ele trata qualquer string não vazia como
  // `true`, inclusive `"false"` — desligar a flag em produção não desligaria
  // nada, e o defeito ficaria invisível até alguém baixar um caderno que não
  // devia existir.
  CADERNO_DRAFT_ENABLED: z
    .enum(['true', 'false'])
    .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
    .transform((v) => v === 'true'),
```

Em `.env.example`:

```
# Caderno (card 04) — geração de rascunho. Default: false em produção.
CADERNO_DRAFT_ENABLED=true
```

- [ ] **Step 5: O módulo e o wiring**

`src/modules/caderno/caderno.module.ts`, no padrão do `cartao-resposta.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { EnvModule } from '../../shared/modules/env/env.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { SimuladoModule } from '../simulado/simulado.module';
import { CadernoController } from './caderno.controller';
import { CadernoService } from './caderno.service';
import { ResolverDeImagens } from './imagens/resolver';

@Module({
  imports: [SimuladoModule, StorageModule, EnvModule],
  controllers: [CadernoController],
  providers: [CadernoService, ResolverDeImagens],
})
export class CadernoModule {}
```

E em `src/app.module.ts`, acrescente `CadernoModule` ao array `imports`, ao lado de
`CartaoRespostaModule`.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno
npx tsc --noEmit -p tsconfig.json
```

Esperado: tudo verde e sem erro de tipo.

- [ ] **Step 7: Provar que o módulo sobe, sem ciclo**

Criar `src/modules/caderno/caderno.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { CadernoModule } from './caderno.module';
import { CadernoService } from './caderno.service';

describe('CadernoModule', () => {
  it('compila e resolve o serviço, sem ciclo de dependência', async () => {
    // ⚠️ Ciclo de módulo no Nest não quebra o build nem os testes unitários:
    // quebra no boot, em produção, com um `undefined` no construtor.
    const moduleRef = await Test.createTestingModule({
      imports: [CadernoModule],
    }).compile();

    expect(moduleRef.get(CadernoService)).toBeInstanceOf(CadernoService);
    await moduleRef.close();
  });
});
```

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.module.spec.ts
```

⚠️ Se este teste precisar de Mongo de verdade para subir o `SimuladoModule`, **pare e reporte** — a
alternativa é mockar o módulo, mas quero decidir isso sabendo, e não descobrir que a suíte passou a
depender de banco.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/modules/caderno/caderno.controller.ts src/modules/caderno/caderno.controller.spec.ts src/modules/caderno/caderno.module.ts src/modules/caderno/caderno.module.spec.ts src/shared/modules/env/env.ts src/app.module.ts
npx eslint src/modules/caderno/caderno.controller.ts src/modules/caderno/caderno.controller.spec.ts src/modules/caderno/caderno.module.ts src/modules/caderno/caderno.module.spec.ts src/shared/modules/env/env.ts src/app.module.ts
git add src/modules/caderno/caderno.controller.ts src/modules/caderno/caderno.controller.spec.ts src/modules/caderno/caderno.module.ts src/modules/caderno/caderno.module.spec.ts src/shared/modules/env/env.ts src/app.module.ts .env.example
git commit -m "$(cat <<'EOF'
feat(caderno): endpoint GET /v1/caderno/:simuladoId

Controller fino no padrao do cartao-resposta, com Content-Disposition e
X-Caderno-Avisos.

So a string exata "true" liga o rascunho: query string chega como texto, e
tratar "presente" como ligado faria ?draft=false LIGAR o rascunho.

CADERNO_DRAFT_ENABLED NAO usa z.coerce.boolean(), que trata qualquer
string nao vazia como true, inclusive "false" -- desligar a flag em
producao nao desligaria nada, e o defeito so apareceria quando alguem
baixasse um caderno que nao devia existir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 6: Gate no Overleaf — **PARA e espera o usuário**

É o **critério principal do card**: o zip baixado do endpoint, subido no Overleaf como projeto novo,
compila **sem edição manual**.

- [ ] **Step 1: Montar o pacote pelo caminho real**

Script descartável no scratchpad (não no repo) que instancia `CadernoService` com `StorageService` e
`EnvService` de verdade, chama `gerarZip` e grava o buffer em disco.

Use um simulado **de verdade** — se não houver Mongo local com dados, **pare e peça**. Não invente
fixture aqui: os cards 02 e 03 já foram testados com fixture, e o que este gate acrescenta é
justamente o caminho completo com dado real.

- [ ] **Step 2: Rodar duas vezes**

A segunda tem que ser visivelmente mais rápida, e o log deve mostrar `cache=` alto e `internet=0`.

- [ ] **Step 3: Apagar o script e conferir a árvore**

`git status --porcelain` limpo. O zip fica fora do repo.

- [ ] **Step 4: PARE**

Diga ao usuário onde está o zip e o que olhar:

- **compila sem edição manual** — o critério principal
- a estrutura: raiz plana, `assets/` como única subpasta, sem `exemplo/`
- o bloco `% AVISO:` no topo do `conteudo.tex`, **com as duas listas juntas** — é a lacuna que o gate
  do card 03 revelou, e esta é a primeira vez que ela aparece fechada
- o nome do arquivo baixado
- marca d'água só no rascunho
- as duas medições

⚠️ **Precisa de `QUESTAO_BUCKET`**, que não existe em nenhum ambiente. Sem ele o gate exercita só o
caminho de URL externa — que é ~100% do acervo, então não é pouco, mas o `origem: 'r2'` fica sem prova
de leitura bem-sucedida. Diga isso ao usuário em vez de deixá-lo descobrir.

**Não prossiga sem a resposta.**

---

### Task 7: Fechar

- [ ] **Step 1: Cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='modules/caderno/*.ts' src/modules/caderno
```

Esperado: ≥ 90% em statements nos arquivos do topo do módulo. Abaixo, acrescente teste — nunca
`istanbul ignore`.

- [ ] **Step 2: Suíte e build**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta src/shared
yarn build && ls dist/main.js dist/modules/caderno/templates/v1/main.tex dist/modules/caderno/imagens/imagem-indisponivel.png && rm -rf dist
```

⚠️ Os três caminhos: o `ms.dockerfile` faz `COPY dist ./` e nada mais, e este card é o primeiro que
**lê** os arquivos do template em runtime.

- [ ] **Step 3: A suíte do cartão passa sem alteração**

```bash
git diff 83fc2e6..HEAD --stat -- src/modules/cartao-resposta
```

Esperado: **nada**. Se houver mudança, reporte.

- [ ] **Step 4: Abrir o PR contra a POC**

```bash
git push -u origin feature/caderno-04-endpoint-zip
gh pr create --base poc/caderno-overleaf --title "[Caderno · Overleaf] Card 04 — endpoint, zip e gate do rascunho"
```

O corpo precisa cobrir: o portão único e por que o `422` saiu; o merge dos avisos fechando a lacuna do
card 03; `jszip` como primeira dependência da POC e por que não escrever à mão; a armadilha do
`z.coerce.boolean()`; e o que ficou pendente de infraestrutura.

⚠️ `--base poc/caderno-overleaf`, **não** `develop`.
