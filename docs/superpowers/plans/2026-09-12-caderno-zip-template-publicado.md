# Caderno — Card 11: o zip usa o template publicado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o zip da prova ler o template do Mongo, e entregar um zip modelo para editar no Overleaf — o que transforma "editar a capa sem deploy" de promessa em fato.

**Architecture:** Duas metades independentes. A primeira troca a fonte de leitura do zip da prova (três arquivos tocados). A segunda é um endpoint novo que monta um simulado falso em memória e roda o gerador de verdade, sem rede, sem R2 e sem Redis.

**Tech Stack:** NestJS 10, Mongoose, `jszip`. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-12-caderno-zip-template-publicado-design.md`

---

## Contexto que o plano assume

O **card 10 está mergeado** (`ms-simulado#183`): existe uma coleção `cadernotemplates` com versões do
template, e um `CadernoTemplateService` com `publicada()`, `rascunho()`, `versoes()`, `salvarRascunho()`,
`publicar()`, `restaurar()` e `descartarRascunho()`. Ele já é exportado pelo módulo — foi exportado
naquele card exatamente para este.

Hoje **ninguém lê o template do Mongo.** O zip da prova continua lendo do `dist`. Este card fecha isso.

⚠️ **Este card não expõe nada pela api (card 12) e não tem tela (card 13).**

## O que já foi verificado (não re-verifique)

| | |
|---|---|
| `CadernoTemplateModule` exporta o serviço | ✅ |
| `montarZip` tem um consumidor só | ✅ `caderno.service.ts` |
| `porVersao` | ✅ no repositório; **falta** no serviço |
| `exemplo/` é referenciado em | `templates.spec.ts` e o comentário do `preambulo.tex:45` |
| `zip.spec.ts` usa `ARQUIVOS_DO_ZIP` | linhas 4 e 42 |
| `exemplo/figura.png` | ❌ não existe; e `exemplo/` é excluído do `dist` |
| `faltantes` com alvo numérico | `gerar-caderno.ts:146-167` — por isso a categoria falsa usa `null` |

## Restrições do repo

- ⚠️ **Nunca** `yarn lint` nem `npx eslint <diretório>`: reformatam arquivos não relacionados. Sempre caminhos explícitos.
- ⚠️ **Nunca** `git add -A` nem `git add .`.
- ⚠️ **Não instale nada.** Se achar que falta pacote, pare e pergunte.
- Jest: `npx jest --detectOpenHandles --forceExit <caminho>`. `rootDir` é `src`.
- ⚠️ `strictNullChecks: false` junto com `strict: true`: use `x === false`, não `!x`.
- ⚠️ **`dist/main.js` tem que ficar na raiz do `dist`.** `.ts` fora de `src/` desloca o `rootDir` e o PM2 morre com `Script not found /var/www/main.js`.
- ⚠️ Dois diretórios de nome parecido: `caderno/template/` (singular, código do card 10) e `caderno/templates/` (plural, os `.tex`).
- Branch `feature/caderno-11-zip-template-publicado`, já criada, **de `develop`**. Commits autônomos liberados.

## Estrutura de arquivos

| Arquivo | O que muda |
|---|---|
| `src/modules/caderno/templates.ts` | `ARQUIVOS_DO_ZIP` vira `ARQUIVOS_DO_TEMPLATE` + `ARQUIVOS_DO_REPO` |
| `src/modules/caderno/zip.ts` | `montarZip` recebe o template pronto |
| `src/modules/caderno/caderno.service.ts` | injeta o serviço do template, loga a versão |
| `src/modules/caderno/caderno.module.ts` | importa `CadernoTemplateModule` |
| `src/modules/caderno/templates/v1/LEIA-ME.txt` | a fonte da verdade é a plataforma, não o repo |
| `src/modules/caderno/templates/v1/preambulo.tex` | só o comentário da linha 45 |
| `src/modules/caderno/templates/v1/exemplo/` | **removido** |
| `nest-cli.json` | perde os três `exclude`, ganha o glob da figura |
| `src/modules/caderno/template/teste/simulado-de-teste.ts` | o simulado falso. **Puro.** |
| `src/modules/caderno/template/teste/figura-exemplo.{ts,png}` | a figura da questão 49 |
| `src/modules/caderno/template/teste/zip-de-teste.ts` | gerador + figura + `montarZip` |
| `src/modules/caderno/template/caderno-template.service.ts` | `+ porVersao` |
| `src/modules/caderno/template/caderno-template.controller.ts` | `+ GET /teste` |

---

### Task 1: `montarZip` recebe o template, em vez de lê-lo

**Files:**
- Modify: `src/modules/caderno/templates.ts`
- Modify: `src/modules/caderno/zip.ts`
- Modify: `src/modules/caderno/zip.spec.ts`

Esta task deixa o `caderno.service.ts` **quebrado** (ele ainda chama `montarZip` sem `template`). A
Task 2 conserta. Não tente consertar aqui: o compilador apontando o único consumidor é a confirmação
de que é um só.

- [ ] **Step 1: Partir a constante**

Em `src/modules/caderno/templates.ts`, `ARQUIVOS_DO_ZIP` vira dois:

```ts
/**
 * Os dois arquivos de layout. **Vêm do Mongo** desde o card 11 — a versão
 * publicada, não o disco.
 *
 * ⚠️ Eles continuam existindo em `templates/v1/` e continuam sendo copiados
 * para o `dist`: são a semente do `seed:template-caderno` e a cópia de
 * resgate. O que mudou é quem o zip da prova lê.
 */
export const ARQUIVOS_DO_TEMPLATE = ['main.tex', 'preambulo.tex'];

/**
 * O que continua vindo do disco.
 *
 * `logo.png` é binário e trocar logo é raro; o `LEIA-ME.txt` descreve o
 * *fluxo*, que muda com o código, não com o layout. Nenhum dos dois é
 * editável pelo Overleaf, então nenhum dos dois entrou no card 10.
 */
export const ARQUIVOS_DO_REPO = ['logo.png', 'LEIA-ME.txt'];
```

⚠️ **Não deixe um `ARQUIVOS_DO_ZIP` como união dos dois.** Ele é hoje "a lista do que o zip leva do
disco", e manter o nome com outro sentido é como o próximo leitor lê do lugar errado.

- [ ] **Step 2: Escrever os testes que falham**

Em `src/modules/caderno/zip.spec.ts`, o helper `pacote()` passa a receber o template, e entram testes
novos. Substitua o topo do arquivo:

```ts
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ARQUIVOS_DO_REPO, TEMPLATE_DIR } from './templates';
import { montarZip } from './zip';

const abrir = async (buffer: Buffer) => JSZip.loadAsync(buffer);

/**
 * ⚠️ O template do teste é DIFERENTE do que está no repo, de propósito: é o
 * que prova que o zip levou o que recebeu, e não o que está no disco.
 */
const TEMPLATE_FALSO = {
  'main.tex': '\\documentclass{exam}% VEM DO MONGO\n',
  'preambulo.tex': '\\usepackage{amsmath}% VEM DO MONGO\n',
};

const pacote = () =>
  montarZip({
    template: TEMPLATE_FALSO,
    conteudo: '% AVISO: um\n\n\\question Teste\n',
    metadados: '\\def\\cadernoTitulo{Teste}\n',
    imagens: [
      { nome: 'assets/01.png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { nome: 'assets/02.jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) },
    ],
  });
```

O teste `os arquivos do template são byte-idênticos ao repo` **muda de sentido** e vira dois:

```ts
  it('os .tex saem do que foi RECEBIDO, não do disco', async () => {
    // ⚠️ O teste central deste card. Antes, o zip lia os quatro arquivos do
    // repo; agora os dois de layout vêm da versão publicada no Mongo. Se ele
    // continuasse lendo do disco, editar o template no banco não mudaria a
    // prova — e nada falharia: o zip sairia perfeito, com o layout velho.
    const zip = await abrir(await pacote());

    for (const [nome, texto] of Object.entries(TEMPLATE_FALSO)) {
      expect(await zip.file(nome)!.async('string')).toBe(texto);
    }

    const noRepo = fs.readFileSync(
      path.join(TEMPLATE_DIR, 'main.tex'),
      'utf-8',
    );
    expect(await zip.file('main.tex')!.async('string')).not.toBe(noRepo);
  });

  it('logo.png e LEIA-ME.txt continuam byte-idênticos ao repo', async () => {
    const zip = await abrir(await pacote());
    for (const arquivo of ARQUIVOS_DO_REPO) {
      const noZip = await zip.file(arquivo)!.async('nodebuffer');
      const noRepo = fs.readFileSync(path.join(TEMPLATE_DIR, arquivo));
      expect(noZip.equals(noRepo)).toBe(true);
    }
  });

  it.each(['main.tex', 'preambulo.tex'])(
    'template sem %s → recusa, nomeando o que faltou',
    async (ausente) => {
      // ⚠️ Sem isto o zip sai com um arquivo só e o LaTeX para com
      // "File not found" — a pessoa recebe um zip que não compila e nada
      // dizendo por quê. O lint do card 10 torna isso improvável, não
      // impossível: uma versão semeada à mão passa longe dele.
      const incompleto = { ...TEMPLATE_FALSO };
      delete incompleto[ausente];

      await expect(
        montarZip({
          template: incompleto,
          conteudo: '',
          metadados: '',
          imagens: [],
        }),
      ).rejects.toThrow(ausente);
    },
  );
```

O teste `não leva o exemplo/ do smoke test` **é apagado nesta task** — a Task 3 remove o diretório, e
um teste que afirma a ausência de algo que não existe mais não prova nada. Os outros testes de
`zip.spec.ts` seguem, só passando `template: TEMPLATE_FALSO` nas chamadas diretas a `montarZip`.

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/zip.spec.ts
```

Esperado: FAIL.

- [ ] **Step 4: Implementar**

`src/modules/caderno/zip.ts`:

```ts
export interface PacoteDoCaderno {
  /** `main.tex` e `preambulo.tex`, da versão publicada no Mongo. */
  template: Record<string, string>;
  conteudo: string;
  metadados: string;
  imagens: ArquivoDoZip[];
}
```

Em `montarZip`, antes de qualquer escrita:

```ts
  const faltando = ARQUIVOS_DO_TEMPLATE.filter(
    (nome) => typeof pacote.template[nome] !== 'string',
  );
  if (faltando.length) {
    throw new Error(
      `template incompleto: falta ${faltando.join(' e ')} na versão publicada`,
    );
  }
```

Depois, os dois do template saem de `pacote.template` e os dois do repo continuam do `TEMPLATE_DIR`.

⚠️ **Atualize o docblock do arquivo.** Ele hoje afirma "⚠️ **O template vem do repo a cada geração.** É
o que impede deriva: ninguém ajusta layout num projeto do Overleaf e esquece de trazer de volta". Isso
**deixa de ser verdade** — e a frase seguinte, sobre a próxima prova sair com o que está versionado,
inverte de sentido: agora a próxima prova sai com o que está **publicado**. Um comentário que mente é
pior que comentário nenhum.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/zip.spec.ts
```

Esperado: PASS. O `tsc` ainda acusa `caderno.service.ts` — é o esperado até a Task 2.

- [ ] **Step 6: Provar que duas decisões mordem**

| Mutação | Teste vermelho |
|---|---|
| `montarZip` voltar a ler os dois `.tex` do `TEMPLATE_DIR` | `os .tex saem do que foi RECEBIDO, não do disco` |
| tirar a checagem de `faltando` | os dois casos de `template sem %s` |

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/modules/caderno/templates.ts src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
npx eslint src/modules/caderno/templates.ts src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
git add src/modules/caderno/templates.ts src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): montarZip recebe o template, em vez de le-lo do disco

ARQUIVOS_DO_ZIP se parte: os dois .tex de layout passam a vir da versao
publicada no Mongo, logo.png e LEIA-ME.txt continuam do dist.

O teste central passa um template DIFERENTE do que esta no repo. Se o
zip continuasse lendo do disco, editar o template no banco nao mudaria a
prova -- e nada falharia: o zip sairia perfeito, com o layout velho.

montarZip recusa template incompleto nomeando o arquivo ausente. Sem
isso o zip sai com um arquivo so e o LaTeX para com "File not found":
a pessoa recebe um zip que nao compila e nada dizendo por que.

O docblock do zip.ts afirmava que o template vem do repo a cada geracao
e que isso impede deriva. Deixou de ser verdade.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: o `CadernoService` lê a versão publicada

**Files:**
- Modify: `src/modules/caderno/caderno.service.ts`
- Modify: `src/modules/caderno/caderno.service.spec.ts`
- Modify: `src/modules/caderno/caderno.module.ts`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/modules/caderno/caderno.service.spec.ts`, o helper `montar` ganha o quarto mock. Acrescente ao
objeto de mocks:

```ts
  const templateService = {
    publicada: jest.fn(
      async () =>
        over.template ?? {
          versao: 7,
          arquivos: {
            'main.tex': '\\documentclass{exam}\n',
            'preambulo.tex': '\\usepackage{amsmath}\n',
          },
        },
    ),
  };
```

E passe-o ao construtor, **na posição que a Task 2 define** (último parâmetro).

Os testes novos:

```ts
describe('o template vem do Mongo', () => {
  it('o zip leva o main.tex da versão publicada', async () => {
    const { servico } = montar({
      template: {
        versao: 9,
        arquivos: {
          'main.tex': '\\documentclass{exam}% DA VERSAO 9\n',
          'preambulo.tex': '\\usepackage{amsmath}\n',
        },
      },
    });

    const { buffer } = await servico.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(buffer);

    expect(await zip.file('main.tex')!.async('string')).toContain(
      'DA VERSAO 9',
    );
  });

  it('sem versão publicada, o 503 propaga — e nada de zip', async () => {
    // ⚠️ O 503 vem do próprio serviço do template (card 10). O que este teste
    // guarda é que o caderno NÃO o engole para cair no disco: um fallback
    // faria o admin achar que sua edição está no ar enquanto a prova sai com
    // o template antigo, sem sinal nenhum.
    const { servico } = montar({});
    servico['template'].publicada = jest.fn(async () => {
      throw new ServiceUnavailableException('nenhuma versão publicada');
    });

    await expect(
      servico.gerarZip('sim1', { draft: false }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('a linha de log registra a versão do template', async () => {
    // ⚠️ Quando alguém disser "a prova saiu torta", a primeira pergunta é qual
    // versão gerou. O template muda sem deploy, então não há rastro no git —
    // o log é o único lugar onde essa resposta pode existir.
    const { servico } = montar({});
    const log = jest
      .spyOn(servico['logger'], 'log')
      .mockImplementation(() => undefined);

    await servico.gerarZip('sim1', { draft: false });

    expect(log.mock.calls[0][0]).toContain('template=7');
  });
});
```

⚠️ Se `servico['logger']` não for acessível assim, **não troque o teste por um que não prove nada**:
injete um `Logger` ou exponha o que precisar, e reporte a mudança.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.service.spec.ts
```

- [ ] **Step 3: Implementar**

No `CadernoService`:

- injetar `private readonly template: CadernoTemplateService` no construtor
- depois do gate de `bloqueado` e **antes** do gerador:

```ts
    // Sem versão publicada isto lança 503, e é para lançar: não existe
    // fallback ao disco. Ver o card 10.
    const templatePublicado = await this.template.publicada();
```

- passar `template: templatePublicado.arquivos` para `montarZip`
- acrescentar `template=${templatePublicado.versao} ` na linha de log, logo depois de `draft=`

⚠️ **`arquivos` é `Record<string, string>`, não `Map`** — corrigido no card 10 porque o Mongoose
recusa chave com ponto num `Map`. Não converta.

Em `caderno.module.ts`, acrescente `CadernoTemplateModule` aos `imports`.

- [ ] **Step 4: Rodar tudo**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/
npx tsc --noEmit -p tsconfig.json
```

Esperado: PASS e `tsc` limpo — a quebra deixada pela Task 1 fecha aqui.

- [ ] **Step 5: Provar que as decisões mordem**

| Mutação | Teste vermelho |
|---|---|
| `montarZip` receber os `.tex` lidos do `TEMPLATE_DIR` | `o zip leva o main.tex da versão publicada` |
| envolver `publicada()` num `try` que cai no disco | `sem versão publicada, o 503 propaga` |
| tirar o `template=` da linha de log | `a linha de log registra a versão do template` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts src/modules/caderno/caderno.module.ts
npx eslint src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts src/modules/caderno/caderno.module.ts
git add src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts src/modules/caderno/caderno.module.ts
git commit -m "$(cat <<'EOF'
feat(caderno): o zip da prova usa a versao publicada no Mongo

CadernoModule -> CadernoTemplateModule, sentido unico. Sem ciclo porque
gerarCaderno e montarZip sao funcoes puras, nao providers.

Sem versao publicada, o 503 do card 10 propaga e nada e gerado. Nao ha
fallback ao disco: ele faria o admin achar que sua edicao esta no ar
enquanto a prova sai com o layout antigo, sem sinal nenhum.

A linha de log ganha template=<versao>. O template muda sem deploy,
entao nao ha rastro no git -- quando alguem disser que a prova saiu
torta, o log e o unico lugar onde a resposta pode existir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: aposentar o `exemplo/`, e parar de mentir no `LEIA-ME`

**Files:**
- Delete: `src/modules/caderno/templates/v1/exemplo/` (os dois arquivos)
- Modify: `src/modules/caderno/templates/v1/LEIA-ME.txt`
- Modify: `src/modules/caderno/templates/v1/preambulo.tex`
- Modify: `nest-cli.json`
- Modify: `src/modules/caderno/templates.spec.ts`

Duas coisas independentes que caem na mesma task porque tocam os mesmos arquivos.

- [ ] **Step 1: Corrigir o `LEIA-ME.txt`**

As linhas 28-30 dizem hoje:

```
  Se a mudança deve valer para todo mundo, daqui em diante, ela precisa
  voltar para o repositório do ms-simulado num pull request. A fonte da
  verdade do template é o repo; este projeto é descartável.
```

Depois deste card as duas frases são **falsas**, e o efeito é o oposto do que a etapa busca: o
coordenador edita o layout, lê o arquivo que veio junto, e vai pedir um PR a um desenvolvedor.

Substitua por texto que diga:

- a fonte da verdade é **a versão publicada na plataforma**, não o repo
- para valer para todo mundo, essa versão precisa ser **publicada** — quem administra a plataforma faz isso
- este projeto do Overleaf continua descartável

⚠️ **A redação tem que ser verdadeira também hoje**, antes do card 13, quando ainda não existe tela de
upload. Não prometa um botão. "Fale com quem administra a plataforma" é verdade antes e depois de a
tela existir; "vá em Configurações → Template e clique em Publicar" só vira verdade daqui a dois cards.

- [ ] **Step 2: Ajustar o teste do `LEIA-ME`**

Em `templates.spec.ts`, o teste `o LEIA-ME diz como tornar uma mudança de layout permanente` casa
`/reposit[óo]rio|repo\b/`. Ele passa a exigir o oposto — que **não** mande abrir PR, e que aponte para
a plataforma:

```ts
  it('o LEIA-ME manda publicar na plataforma, não abrir um PR', () => {
    // ⚠️ Este arquivo viaja dentro de TODA prova gerada. Antes do card 11 a
    // fonte da verdade era o repo e a instrução certa era um pull request.
    // Agora é a versão publicada no Mongo — e mandar pedir PR a um
    // desenvolvedor é exatamente o atrito que os cards 10 a 13 removem.
    const leiaMe = lerTexto('LEIA-ME.txt');
    expect(leiaMe).not.toMatch(/pull request/i);
    expect(leiaMe.toLowerCase()).toContain('plataforma');
  });
```

- [ ] **Step 3: Remover o `exemplo/` e os testes dele**

```bash
git rm -r src/modules/caderno/templates/v1/exemplo
```

Em `templates.spec.ts`, apague os quatro testes que falam do `exemplo/`:

- `o exemplo existe e tem os dois arquivos, não vazios`
- `o conteudo.tex de exemplo avisa que não é modelo da saída do gerador`
- `o exemplo continua usando CorrectChoice, e diz por quê`
- a parte de `o template não cita cards que não existem nesta POC` que lê `exemplo/metadados.tex`
  (o resto do teste, sobre `main.tex` e `preambulo.tex`, **fica**)

- [ ] **Step 4: Tirar os `exclude` do `nest-cli.json`**

Os três globs de `modules/caderno/templates/**` têm `"exclude": "modules/caderno/templates/**/exemplo/**"`.
Com o diretório removido, o exclude guarda coisa nenhuma. Tire-os.

E o teste `o nest-cli copia o template pro dist e deixa o exemplo de fora` monta os pares esperados
**com** `exclude`. Ele passa a esperar só o `include`, e o nome muda para dizer o que ele guarda agora:

```ts
  it('o nest-cli copia toda extensão do template pro dist', () => {
```

⚠️ **Não apague esse teste junto com o exclude.** A invariante que ele guarda — toda extensão do nível
de topo coberta por um glob — é o que protege o **próximo** arquivo que alguém puser ali (uma `.sty`,
uma `exam.cls` vendorizada). Ela é independente do `exemplo/`.

- [ ] **Step 5: Corrigir o comentário do `preambulo.tex`**

A linha 45 diz hoje:

```
% ulem, enumitem, tabularx e booktabs são usados pelo exemplo/, mantidos para
% um card futuro poder emitir essas construções sem mexer aqui.
```

O `exemplo/` não existe mais, mas **os pacotes ficam**. Reescreva dizendo o novo motivo: eles estão à
disposição de quem editar o template no Overleaf. O gerador nunca emitiu tabela nem lista; remover
pacote que o coordenador pode querer, para limpar quatro linhas de peso morto, é piorar a vida dele
sem ganho nenhum.

⚠️ **Não remova o `[normalem]` do `ulem`.** Sem ele o `ulem` sequestra o `\emph` e sublinha todo
itálico — falha silenciosa, só aparece olhando o PDF. Há teste, e ele fica.

- [ ] **Step 6: Rodar**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/
rm -rf dist && yarn build >/dev/null && ls dist/modules/caderno/templates/v1/
```

Esperado: PASS, e o `dist` com `LEIA-ME.txt`, `logo.png`, `main.tex`, `preambulo.tex` — **sem**
`exemplo/`.

- [ ] **Step 7: Provar que o teste do LEIA-ME morde**

Ponha `pull request` de volta no texto e confirme que o teste novo fica vermelho. Restaure.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/modules/caderno/templates.spec.ts
npx eslint src/modules/caderno/templates.spec.ts
git add src/modules/caderno/templates.spec.ts src/modules/caderno/templates/v1/LEIA-ME.txt src/modules/caderno/templates/v1/preambulo.tex nest-cli.json
git commit -m "$(cat <<'EOF'
chore(caderno): aposentar o exemplo/ e parar de mandar abrir PR

O LEIA-ME.txt viaja dentro de TODA prova gerada e dizia que a fonte da
verdade do template e o repo, e que mudanca permanente vira pull
request. Depois deste card as duas frases sao falsas, e o efeito e o
oposto do que a etapa busca: o coordenador vai pedir PR a um
desenvolvedor. A redacao nova aponta pra plataforma sem prometer a tela
do card 13, que ainda nao existe.

O exemplo/ sai porque fixture estatico desatualiza em silencio -- o
proprio exemplo/conteudo.tex ja carregava esse aviso, escrito quando
existia um conversor de markdown que nao existe mais. Quem passa a ser
o smoke test do template e o mock gerado, que nao tem como envelhecer
sozinho porque usa o gerador de verdade.

ulem, enumitem, tabularx e booktabs FICAM no preambulo: o gerador nunca
emitiu tabela, mas quem edita o template no Overleaf pode querer.
Remover pacote pra limpar quatro linhas e piorar a vida do coordenador
sem ganho.

O teste do nest-cli perde o exclude e mantem a invariante -- toda
extensao do topo coberta por um glob -- que protege o proximo arquivo
posto ali, e e independente do exemplo/.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: o simulado falso e a figura

**Files:**
- Create: `src/modules/caderno/template/teste/simulado-de-teste.ts`
- Create: `src/modules/caderno/template/teste/simulado-de-teste.spec.ts`
- Create: `src/modules/caderno/template/teste/figura-exemplo.ts`
- Create: `src/modules/caderno/template/teste/figura-exemplo.png`
- Modify: `nest-cli.json`

Peça pura: um objeto e um arquivo. É o insumo do endpoint da Task 5.

- [ ] **Step 1: Criar a figura**

Um PNG pequeno e **obviamente sintético** — nada que possa ser confundido com material de prova. Ela
existe para exercitar `max width=\linewidth` numa coluna de 8 cm, não para ilustrar coisa nenhuma.
Algo como um retângulo com um rótulo tipo "FIGURA DE TESTE" serve.

⚠️ **Não reuse `imagens/imagem-indisponivel.png`**: ela é a caixa cinza que significa **falha**, e o
`LEIA-ME` explica isso ao coordenador. Usá-la como imagem bem-sucedida faria ele achar que o teste
quebrou.

Gere-a como quiser (ImageMagick, um script Node, o que houver). Mantenha abaixo de uns 20 KB.

- [ ] **Step 2: O acessor, no molde do placeholder**

`src/modules/caderno/template/teste/figura-exemplo.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * A figura da questão 49 do simulado de teste.
 *
 * ⚠️ Lida com `readFileSync`, **não importada**: um `import` de arquivo fora
 * do grafo do TypeScript desloca o `rootDir` inferido e move o `dist/main.js`,
 * quebrando o PM2 com "Script not found". Mesmo motivo do
 * `imagens/placeholder.ts`, que é o molde daqui.
 *
 * ⚠️ Mora ao lado do código que a usa, e **não** em `templates/v1/exemplo/`:
 * aquele diretório era excluído do `dist`, então a figura não chegaria em
 * produção e o endpoint quebraria só dentro do container.
 */
export const CAMINHO_FIGURA_EXEMPLO = path.join(
  __dirname,
  'figura-exemplo.png',
);

export function lerFiguraExemplo(): Buffer {
  return fs.readFileSync(CAMINHO_FIGURA_EXEMPLO);
}
```

- [ ] **Step 3: O glob no `nest-cli.json`**

Acrescente `{ "include": "modules/caderno/template/teste/*.png" }`.

⚠️ Note o **singular**: `template/teste`, não `templates/`. O teste que confere os pares filtra por
`include.startsWith('modules/caderno/templates')` — com `s` — então esta entrada não colide com ele.

- [ ] **Step 4: Escrever o teste do simulado falso**

`src/modules/caderno/template/teste/simulado-de-teste.spec.ts`:

```ts
import * as fs from 'fs';
import { gerarCaderno } from '../../gerador/gerar-caderno';
import { CAMINHO_FIGURA_EXEMPLO, lerFiguraExemplo } from './figura-exemplo';
import { SIMULADO_DE_TESTE } from './simulado-de-teste';

describe('o simulado de teste', () => {
  it('tem as 6 questões, numeradas a partir de 46', () => {
    // 46 porque é o segundo dia do ENEM — e foi exatamente aí que um bug de
    // `faltantes` apareceu no card 02. O mock exercita a numeração real.
    expect(SIMULADO_DE_TESTE.questoes.map((q) => q.numero)).toEqual([
      46, 47, 48, 49, 50, 51,
    ]);
  });

  it('a categoria não tem alvo de quantidade', () => {
    // ⚠️ Medido em gerar-caderno.ts:146-167: com um alvo numérico, o modo
    // draft calcula `faltantes` a partir do menor número presente — seis
    // questões começando em 46 contra um alvo de 90 fariam o zip de teste
    // anunciar 84 pendências que não existem.
    expect(SIMULADO_DE_TESTE.categoria.quantidadeTotalQuestao).toBeNull();
  });

  it('o título avisa que não é prova', () => {
    expect(SIMULADO_DE_TESTE.nome).toContain('TEMPLATE DE TESTE');
  });
});

describe('o que o gerador faz com ele', () => {
  const gerado = () => gerarCaderno(SIMULADO_DE_TESTE, { draft: true });

  it('sai uma imagem só, e ela vem do nosso bucket, não da internet', () => {
    // ⚠️ `asset://` e não `https://`: se algum dia alguém ligar o resolvedor
    // real neste caminho por engano, asset:// bate no R2 e da 404 — enquanto
    // https:// faria um endpoint de TESTE emitir requisição de saída.
    const { imagens } = gerado();
    expect(imagens).toHaveLength(1);
    expect(imagens[0].origem).toBe('r2');
    expect(imagens[0].arquivo).toBe('assets/01');
  });

  it('a questão sem texto nas alternativas gera aviso', () => {
    // É o caso dominante do acervo medido, e o que produz a caixa cinza. Um
    // template de teste que não o mostrasse esconderia o problema mais comum.
    expect(gerado().avisos.length).toBeGreaterThan(0);
  });

  it('em draft, o metadados LIGA a marca d’água', () => {
    // ⚠️ `\cadernoRascunho` é um \newif: liga com \cadernoRascunhotrue. A
    // forma \def\cadernoRascunho{true} — que o card sugeria — não liga nada e
    // não dá erro, e a marca d'água simplesmente não aparece.
    expect(gerado().metadados).toContain('\\cadernoRascunhotrue');
  });

  it('não anuncia pendência nenhuma', () => {
    expect(gerado().questoesFaltantes).toEqual([]);
  });

  it('o conteúdo tem os seis blocos', () => {
    expect(gerado().conteudo.match(/\\question/g)).toHaveLength(6);
  });
});

describe('a figura de exemplo', () => {
  it('existe, é PNG e é pequena', () => {
    const bytes = lerFiguraExemplo();
    expect(bytes.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(bytes.length).toBeLessThan(20 * 1024);
  });

  it('NÃO é o placeholder de imagem indisponível', () => {
    // A caixa cinza significa falha, e o LEIA-ME explica isso. Usá-la como
    // imagem bem-sucedida faria o coordenador achar que o teste quebrou.
    const placeholder = fs.readFileSync(
      require.resolve('../../imagens/imagem-indisponivel.png'),
    );
    expect(lerFiguraExemplo().equals(placeholder)).toBe(false);
  });

  it('o caminho aponta para dentro do módulo', () => {
    expect(CAMINHO_FIGURA_EXEMPLO).toContain('template/teste');
  });
});
```

⚠️ Se `require.resolve` de um `.png` não funcionar na config do jest, use `path.join(__dirname, ...)` —
mas **não apague o teste**: ele é o que impede o atalho de reusar o placeholder.

- [ ] **Step 5: Rodar, confirmar que falha, implementar**

`simulado-de-teste.ts` exporta uma constante `SIMULADO_DE_TESTE: SimuladoParaCaderno` com:

| # | conteúdo |
|---|---|
| 46 | texto curto, cinco alternativas curtas |
| 47 | enunciado de dois parágrafos, longo — quebra de coluna |
| 48 | fórmula inline (`$x^2$`) e display (`$$\int_0^1$$`) |
| 49 | `![](asset://exemplo/figura-de-teste)` no enunciado |
| 50 | alternativas longas, uma com três linhas |
| 51 | enunciado normal, **alternativas vazias** |

`nome: 'TEMPLATE DE TESTE — NÃO APLICAR'`, `categoria: { nome: 'Modelo de template', duracao: 300,
quantidadeTotalQuestao: null }`.

⚠️ O texto das questões é fabricado e deve **parecer fabricado**. Um enunciado plausível demais, com
marca d'água só na diagonal, é o tipo de coisa que vira PDF impresso por engano.

⚠️ `status` das questões precisa ser o que o gerador aceita como incluível — veja `selecionar` em
`gerar-caderno.ts`.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/template/teste/
```

- [ ] **Step 7: Provar que duas decisões mordem**

| Mutação | Teste vermelho |
|---|---|
| `quantidadeTotalQuestao: 90` na categoria falsa | `não anuncia pendência nenhuma` |
| trocar `asset://` por `https://` na questão 49 | `sai uma imagem só, e ela vem do nosso bucket` |

- [ ] **Step 8: Confirmar que a figura chega ao `dist`**

```bash
rm -rf dist && yarn build >/dev/null && ls -la dist/modules/caderno/template/teste/
```

Esperado: o `.png` presente. Se não estiver, o glob está errado e **o endpoint quebraria só em
produção** — pare e reporte.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/modules/caderno/template/teste/simulado-de-teste.ts src/modules/caderno/template/teste/simulado-de-teste.spec.ts src/modules/caderno/template/teste/figura-exemplo.ts
npx eslint src/modules/caderno/template/teste/simulado-de-teste.ts src/modules/caderno/template/teste/simulado-de-teste.spec.ts src/modules/caderno/template/teste/figura-exemplo.ts
git add src/modules/caderno/template/teste/ nest-cli.json
git commit -m "$(cat <<'EOF'
feat(caderno): simulado falso e figura para o zip de teste

Mock de dominio, nao arquivo estatico: o endpoint roda o gerador de
verdade sobre um simulado em memoria, entao o teste valida template e
gerador ATUAIS juntos. Um .tex estatico desatualiza em silencio -- foi
por isso que o exemplo/ saiu.

Seis blocos escolhidos pelo que quebra layout, numerados a partir de 46
(segundo dia do ENEM, onde um bug de `faltantes` apareceu no card 02).

quantidadeTotalQuestao null de proposito: com alvo numerico, o modo
draft anunciaria 84 pendencias inexistentes.

A imagem usa asset:// e nao https://. Se alguem ligar o resolvedor real
neste caminho por engano, asset:// bate no R2 e da 404 -- https:// faria
um endpoint de TESTE emitir requisicao de saida.

A figura mora ao lado do codigo, com glob proprio, no molde do
imagem-indisponivel.png. Em templates/v1/exemplo/ ela nao chegaria ao
dist e o endpoint quebraria so dentro do container.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: o endpoint do zip de teste

**Files:**
- Create: `src/modules/caderno/template/teste/zip-de-teste.ts`
- Create: `src/modules/caderno/template/teste/zip-de-teste.spec.ts`
- Modify: `src/modules/caderno/template/caderno-template.service.ts`
- Modify: `src/modules/caderno/template/caderno-template.service.spec.ts`
- Modify: `src/modules/caderno/template/caderno-template.controller.ts`
- Modify: `src/modules/caderno/template/caderno-template.controller.spec.ts`

⚠️ **O módulo não muda.** `gerarCaderno`, `montarZip` e o zip de teste são funções puras — não há
provider novo, e por isso não há ciclo com o `CadernoModule`.

- [ ] **Step 1: `porVersao` no serviço**

O repositório já tem. O serviço ganha o passthrough, com 404 quando não existe:

```ts
  /** 404 quando a versão não existe. Usado pelo zip de teste. */
  async porVersao(versao: number): Promise<CadernoTemplate> {
    const encontrada = await this.repo.porVersao(versao);
    if (!encontrada) {
      throw new NotFoundException(`versão ${versao} não existe`);
    }
    return encontrada;
  }
```

Com um teste no `caderno-template.service.spec.ts`: devolve a versão quando existe, 404 quando não.

- [ ] **Step 2: Escrever o teste do montador**

`src/modules/caderno/template/teste/zip-de-teste.spec.ts`:

```ts
import JSZip from 'jszip';
import { montarZipDeTeste } from './zip-de-teste';

const TEMPLATE = {
  'main.tex': '\\documentclass{exam}% V9\n',
  'preambulo.tex': '\\usepackage{amsmath}\n',
};

const abrir = async () => JSZip.loadAsync(await montarZipDeTeste(TEMPLATE));

describe('montarZipDeTeste', () => {
  it('tem os mesmos arquivos do zip da prova', async () => {
    const zip = await abrir();
    const nomes = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(nomes).toEqual([
      'LEIA-ME.txt',
      'assets/01.png',
      'conteudo.tex',
      'logo.png',
      'main.tex',
      'metadados.tex',
      'preambulo.tex',
    ]);
  });

  it('leva o template RECEBIDO, não o do repo', async () => {
    const zip = await abrir();
    expect(await zip.file('main.tex')!.async('string')).toContain('% V9');
  });

  it('a marca d’água está LIGADA', async () => {
    // ⚠️ `\cadernoRascunhotrue`, não `\def\cadernoRascunho{true}`: a segunda
    // forma não liga nada e não dá erro. Um zip de teste sem marca d'água
    // pode ser impresso como prova.
    const zip = await abrir();
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      '\\cadernoRascunhotrue',
    );
  });

  it('o título diz que é teste', async () => {
    const zip = await abrir();
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      'TEMPLATE DE TESTE',
    );
  });

  it('a figura entra com os bytes do PNG commitado', async () => {
    const zip = await abrir();
    const bytes = await zip.file('assets/01.png')!.async('nodebuffer');
    expect(bytes.subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it('as seis questões estão no conteudo.tex', async () => {
    const zip = await abrir();
    const conteudo = await zip.file('conteudo.tex')!.async('string');
    expect(conteudo.match(/\\question/g)).toHaveLength(6);
  });
});
```

- [ ] **Step 3: Implementar o montador**

`src/modules/caderno/template/teste/zip-de-teste.ts`:

```ts
export async function montarZipDeTeste(
  template: Record<string, string>,
): Promise<Buffer>;
```

O que ele faz:

1. `gerarCaderno(SIMULADO_DE_TESTE, { draft: true })`
2. resolve as imagens **localmente**: cada `ImagemRef` vira `{ nome: `${ref.arquivo}.png`, buffer: lerFiguraExemplo() }`
3. `montarZip({ template, conteudo, metadados, imagens })`

⚠️ **Sem `ResolverDeImagens`.** É o que mantém a promessa de "sem Redis, sem R2 e sem rede": o teste do
template não pode depender de infra externa, senão ele deixa de testar o template e passa a testar a
infra.

⚠️ **Sempre `draft: true`**, independente de `CADERNO_DRAFT_ENABLED`. Aquele gate mora no
`CadernoService.gerarZip` e protege outra coisa — geração de prova a partir de simulado incompleto.
Aqui a marca d'água é a garantia de que um zip de teste não vire prova impressa, e ela não pode
depender de flag de ambiente.

⚠️ **Todas as refs viram a mesma figura**, não só a primeira. Hoje o mock tem uma imagem; se ganhar
outra, um mapeamento que só atende `imagens[0]` deixaria a segunda sem arquivo, e o LaTeX pararia com
`File not found` — a falha que o card 03 existe para impedir.

- [ ] **Step 4: Escrever o teste do endpoint**

No `caderno-template.controller.spec.ts`:

```ts
describe('GET /template/teste', () => {
  it('sem parâmetro, usa a PUBLICADA', async () => {
    const { servico, controller } = controllerCom();
    await controller.zipDeTeste(undefined, undefined, resFalso());
    expect(servico.publicada).toHaveBeenCalled();
    expect(servico.rascunho).not.toHaveBeenCalled();
  });

  it('?versao=3 usa a v3', async () => {
    const { servico, controller } = controllerCom();
    await controller.zipDeTeste('3', undefined, resFalso());
    expect(servico.porVersao).toHaveBeenCalledWith(3);
  });

  it('?rascunho=1 usa o rascunho', async () => {
    const { servico, controller } = controllerCom();
    await controller.zipDeTeste(undefined, '1', resFalso());
    expect(servico.rascunho).toHaveBeenCalled();
  });

  it('os dois juntos → 400', async () => {
    const { controller } = controllerCom();
    await expect(
      controller.zipDeTeste('3', '1', resFalso()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['xis', 'sim', 'false', '0', ''])(
    '?rascunho=%s → 400, e NÃO a publicada em silêncio',
    async (valor) => {
      // ⚠️ Este projeto já se queimou com z.coerce.boolean() tratando "false"
      // como true. Cair na publicada porque o valor não foi entendido devolve
      // a versão errada sem sinal nenhum — o defeito exato que este endpoint
      // existe para evitar.
      const { servico, controller } = controllerCom();
      await expect(
        controller.zipDeTeste(undefined, valor, resFalso()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(servico.publicada).not.toHaveBeenCalled();
    },
  );

  it('?versao=abc → 400', async () => {
    const { controller } = controllerCom();
    await expect(
      controller.zipDeTeste('abc', undefined, resFalso()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sem rascunho pendente → 404', async () => {
    const { controller } = controllerCom({
      rascunho: jest.fn().mockResolvedValue(null),
    });
    await expect(
      controller.zipDeTeste(undefined, '1', resFalso()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('NÃO escreve nada', async () => {
    // O card é explícito: leitura pura. Uma versão anterior gravava
    // `testadoEm` a cada download; saiu quando a compilação no Overleaf
    // virou passo obrigatório por construção.
    const { servico, controller } = controllerCom();
    await controller.zipDeTeste(undefined, undefined, resFalso());
    for (const escrita of [
      'salvarRascunho',
      'publicar',
      'restaurar',
      'descartarRascunho',
    ]) {
      expect(servico[escrita]).not.toHaveBeenCalled();
    }
  });
});
```

`resFalso()` devolve um objeto com `set: jest.fn()`, como o `Response` do Express que os outros
endpoints já usam.

- [ ] **Step 5: Implementar o endpoint**

No `CadernoTemplateController`:

```ts
  @Get('teste')
  @Header('Content-Type', 'application/zip')
  async zipDeTeste(
    @Query('versao') versao: string | undefined,
    @Query('rascunho') rascunho: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile>;
```

A ordem:

1. os dois presentes → `BadRequestException`
2. `rascunho` presente: só `'1'` e `'true'` são aceitos; qualquer outra coisa → `BadRequestException`
3. escolher a origem: rascunho (404 se `null`) · `porVersao(n)` (404 dentro do serviço) · `publicada()` (503 dentro do serviço)
4. `montarZipDeTeste(origem.arquivos)`
5. `Content-Disposition` com um nome que diga o que é — algo como `template-teste-v9.zip`

⚠️ `versao` é query **opcional**: um `ParseIntPipe` cru rejeita a ausência junto com o lixo, e a
ausência é o caso normal. Valide só quando o parâmetro veio.

⚠️ Não há rota `GET /:algo` neste controller, então `GET /teste` não colide com nada. Se um dia
houver, `teste` precisa vir antes.

- [ ] **Step 6: Rodar**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 7: Provar que as decisões mordem**

| Mutação | Teste vermelho |
|---|---|
| aceitar qualquer valor em `?rascunho=` | os cinco casos de `?rascunho=%s → 400` |
| ignorar a combinação dos dois parâmetros | `os dois juntos → 400` |
| resolver só `imagens[0]` no montador | *(nenhum hoje — o mock tem uma imagem só; o teste é a garantia futura, e o comentário diz isso)* |
| trocar `draft: true` por `false` | `a marca d’água está LIGADA` |

⚠️ A terceira linha é uma mutação **sem** teste vermelho, e está listada de propósito para você não
gastar tempo procurando. Se quiser fechá-la, um segundo `![]` no mock resolve — mas isso muda o
simulado da Task 4, então **pergunte antes**.

- [ ] **Step 8: Commit**

```bash
npx prettier --write "src/modules/caderno/template/teste/zip-de-teste*.ts" src/modules/caderno/template/caderno-template.service.ts src/modules/caderno/template/caderno-template.service.spec.ts src/modules/caderno/template/caderno-template.controller.ts src/modules/caderno/template/caderno-template.controller.spec.ts
npx eslint src/modules/caderno/template/teste/zip-de-teste.ts src/modules/caderno/template/teste/zip-de-teste.spec.ts src/modules/caderno/template/caderno-template.service.ts src/modules/caderno/template/caderno-template.service.spec.ts src/modules/caderno/template/caderno-template.controller.ts src/modules/caderno/template/caderno-template.controller.spec.ts
git add src/modules/caderno/template/teste/zip-de-teste.ts src/modules/caderno/template/teste/zip-de-teste.spec.ts src/modules/caderno/template/caderno-template.service.ts src/modules/caderno/template/caderno-template.service.spec.ts src/modules/caderno/template/caderno-template.controller.ts src/modules/caderno/template/caderno-template.controller.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): GET /template/teste -- o zip modelo do Overleaf

Fecha o ciclo do card 10: o que sai daqui, editado no Overleaf, e o que
volta pelo upload. Serve tambem pra conferir uma versao antiga antes de
restaura-la.

?rascunho= so aceita 1 e true; qualquer outro valor e 400, nao a
publicada em silencio. Este projeto ja se queimou com
z.coerce.boolean() tratando "false" como true, e devolver a versao
errada sem sinal e o defeito exato que o endpoint existe pra evitar.

Sem ResolverDeImagens: sem Redis, sem R2, sem rede. Um teste de template
que depende de infra externa deixa de testar o template.

Sempre draft:true, independente de CADERNO_DRAFT_ENABLED -- a marca
d'agua e o que impede um zip de teste de virar prova impressa, e nao
pode depender de flag de ambiente.

Leitura pura: nenhum metodo de escrita do repositorio e alcancado, e ha
teste pra isso.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: GATE MANUAL — o que só o Overleaf prova

⚠️ **PARE AQUI E ESPERE O USUÁRIO.** Não siga para a Task 7 sem a resposta dele.

Três coisas não têm como ser provadas por teste automatizado, e as três são o motivo de esta etapa
existir:

| o que falta provar | por que teste não alcança |
|---|---|
| o zip de teste **compila** no Overleaf, com as 6 questões e a marca d'água | nenhum LaTeX roda no CI |
| **o ciclo fecha**: baixar o teste → editar no Overleaf → baixar de lá → o upload do card 10 aceitar | depende do zip que o Overleaf gera, não do que nós montamos |
| o zip **da prova** continua compilando depois de ler o template do Mongo | idem |

O segundo item é o critério que **ficou pendente no card 10** — todos os fixtures de lá são zips que
nós montamos, nunca um que o Overleaf produziu. É aqui que ele pode ser fechado.

- [ ] **Step 1: Gerar os dois zips e entregar**

Suba o serviço apontando para um Mongo com o template semeado e baixe:

```bash
curl -s -o /tmp/template-teste.zip 'http://localhost:3000/v1/caderno/template/teste'
curl -s -o /tmp/prova.zip 'http://localhost:3000/v1/caderno/<simuladoId>'
```

⚠️ Se o `.env` local apontar para homologação, **isto lê** de lá — leitura é inofensiva, mas diga qual
banco você usou.

- [ ] **Step 2: Parar e apresentar**

Apresente, nesta ordem:

1. **as contagens reais** de cada spec, não "todos passando"
2. **onde os dois zips estão**, e o que pedir ao usuário: subir o de teste no Overleaf, confirmar as 6
   questões e a marca d'água, baixar o projeto de lá e subir pelo `POST /template/rascunho`
3. **o que a Task 5 deixou sem cobertura de propósito**: a mutação de resolver só `imagens[0]`
4. **a pergunta do card 12**: os endpoints que ele vai expor incluem o `GET /teste`, e o `?rascunho=1`
   precisa de permissão diferente do resto?

⚠️ **Não abra o PR antes desta resposta.**

---

### Task 7: fechamento

- [ ] **Step 1: Cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='**/caderno/**/*.ts' src/modules/caderno/
```

Critério: ≥ 90% no que este card toca. Antes de escrever teste para fechar número, **olhe o que está
descoberto**: passthrough de uma linha não vale um teste; regra de decisão vale.

- [ ] **Step 2: A suíte inteira e o build**

```bash
npx jest --detectOpenHandles --forceExit
rm -rf dist && yarn build && ls -la dist/main.js
ls dist/modules/caderno/templates/v1/ dist/modules/caderno/template/teste/
```

⚠️ `dist/main.js` **na raiz**. E o `dist` precisa ter: `logo.png`, `LEIA-ME.txt`, os dois `.tex`,
**sem** `exemplo/`, e a `figura-exemplo.png`.

- [ ] **Step 3: Revisar o próprio diff**

```bash
git log --oneline develop..HEAD
git diff develop...HEAD --stat
```

Procure: `console.log`, `.only`, arquivo fora do escopo, e — em especial — qualquer comentário que
ainda diga que o template vem do repo.

- [ ] **Step 4: PR**

Base `develop`. O corpo precisa cobrir:

- o zip da prova passou a ler do Mongo, e o 503 quando não há versão publicada
- **o `LEIA-ME.txt` parou de mandar abrir PR** — e por que isso é escopo deste card
- o `exemplo/` saiu, e por que os pacotes do preâmbulo ficaram
- o endpoint de teste, e as três coisas que ele **não** toca (Redis, R2, rede)
- o resultado do gate manual, com o que o usuário confirmou
- ⚠️ **que o card 12 agora tem um endpoint a mais para expor** do que o card previa
