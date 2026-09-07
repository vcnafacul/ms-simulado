# Caderno · Overleaf — Card 00: template no repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer para este repo o template LaTeX já validado, e garantir por teste que ele chega ao `dist` — porque template fora do `dist` não existe em produção.

**Architecture:** Sem código de runtime. São arquivos copiados byte-a-byte de outra branch, três globs no `nest-cli.json`, e um spec que tranca o contrato de empacotamento pelo mesmo caminho que o card 04 vai usar para ler.

**Tech Stack:** LaTeX (arquivos estáticos), NestJS 10 (`nest-cli.json` assets), Jest 29 + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-07-caderno-overleaf-template-repo-design.md` (commit `fbb9b90`)

---

## Contexto que o plano assume

**Não há distribuição TeX nesta máquina, e instalar está fora de escopo.** Nunca tente compilar. A
verificação de layout é uma rodada manual no Overleaf, na Task 4.

**Os arquivos já foram compilados e aprovados** numa rodada real, no card 01 da POC anterior. Não são
reescritos — são copiados de `poc/caderno-latex`.

**O bug que este card existe para travar:** o `ms.dockerfile` faz `COPY dist ./` e mais nada. Como o zip
desta POC é autossuficiente (cada geração vira um projeto novo no Overleaf), o serviço **lê** o template
em runtime para pô-lo dentro. Template que não chega ao `dist` some em produção, e a falha só aparece
em runtime, dentro do container.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/templates/v1/main.tex` | Classe, ordem dos `\input`, ambiente `questions`. Vai no zip. |
| `src/modules/caderno/templates/v1/preambulo.tex` | Pacotes, macros do caderno, `\capaCaderno`. Vai no zip. |
| `src/modules/caderno/templates/v1/logo.png` | Usada pela capa. Vai no zip, na raiz. |
| `src/modules/caderno/templates/v1/LEIA-ME.txt` | Instruções para quem baixa. Vai no zip. |
| `src/modules/caderno/templates/v1/exemplo/` | Smoke test do template. **Não** vai no zip nem no `dist`. |
| `src/modules/caderno/templates.spec.ts` | Contrato de empacotamento: caminho, arquivos, cobertura de glob. |
| `nest-cli.json` | Três globs, todos com `exclude` do `exemplo/`. |

---

### Task 1: Os arquivos do template

**Files:**
- Create: `src/modules/caderno/templates.spec.ts`
- Create: `src/modules/caderno/templates/v1/{main.tex,preambulo.tex,logo.png,LEIA-ME.txt}`
- Create: `src/modules/caderno/templates/v1/exemplo/{conteudo.tex,metadados.tex}`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/templates.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * Contrato de empacotamento do template do caderno.
 *
 * O caminho aqui é o mesmo que o card 04 vai usar para montar o zip:
 * `path.join(__dirname, 'templates/v1')` a partir de `src/modules/caderno/`.
 *
 * O `ms.dockerfile` faz `COPY dist ./` e mais nada. Template que não chega no
 * `dist` não existe em produção, e a falha só aparece em runtime, dentro do
 * container — nunca em build. Como este card não tem código de runtime, este
 * spec é a única verificação automatizável que ele tem.
 */
const TEMPLATE_DIR = path.join(__dirname, 'templates/v1');

/** Os quatro arquivos que viajam no zip do usuário. */
const ARQUIVOS_DO_ZIP = ['main.tex', 'preambulo.tex', 'logo.png', 'LEIA-ME.txt'];

const lerTexto = (arquivo: string): string =>
  fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');

describe('template do caderno (v1)', () => {
  it.each(ARQUIVOS_DO_ZIP)('%s existe e não está vazio', (arquivo) => {
    const tamanho = fs.statSync(path.join(TEMPLATE_DIR, arquivo)).size;
    expect(tamanho).toBeGreaterThan(0);
  });

  it('main.tex usa a exam.cls em duas colunas', () => {
    expect(lerTexto('main.tex')).toContain(
      '\\documentclass[11pt,a4paper,twocolumn]{exam}',
    );
  });

  it('preambulo carrega ulem com [normalem]', () => {
    // Sem [normalem] o ulem sequestra o \emph e sublinha todo itálico. É
    // falha silenciosa: não dá erro, só aparece olhando o PDF.
    expect(lerTexto('preambulo.tex')).toContain('\\usepackage[normalem]{ulem}');
  });

  it('o exemplo existe e tem os dois arquivos', () => {
    // O `exclude` do nest-cli protege este diretório. Se ele sumir, o exclude
    // passa a guardar um caminho que não existe e ninguém percebe.
    const noExemplo = fs.readdirSync(path.join(TEMPLATE_DIR, 'exemplo'));
    expect(noExemplo).toEqual(
      expect.arrayContaining(['conteudo.tex', 'metadados.tex']),
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: FAIL, `ENOENT` apontando para `templates/v1/main.tex`.

- [ ] **Step 3: Copiar os arquivos da branch de origem**

Cópia byte-a-byte, via `git show` — não abra os arquivos num editor, para não arriscar mudança de
encoding ou de fim de linha.

```bash
mkdir -p src/modules/caderno/templates/v1/exemplo
ORIG=poc/caderno-latex:src/modules/caderno/templates/padrao/v1

git show $ORIG/main.tex              > src/modules/caderno/templates/v1/main.tex
git show $ORIG/preambulo.tex         > src/modules/caderno/templates/v1/preambulo.tex
git show $ORIG/LEIA-ME.txt           > src/modules/caderno/templates/v1/LEIA-ME.txt
git show $ORIG/exemplo/conteudo.tex  > src/modules/caderno/templates/v1/exemplo/conteudo.tex
git show $ORIG/exemplo/metadados.tex > src/modules/caderno/templates/v1/exemplo/metadados.tex

cp src/modules/cartao-resposta/assets/logo.png src/modules/caderno/templates/v1/logo.png
```

⚠️ A `logo.png` é **cópia**, não referência cruzada: o `\capaCaderno` faz
`\includegraphics{logo.png}` com caminho relativo ao `main.tex`, então ela precisa estar na raiz do
zip. Apontar para `cartao-resposta/assets/` acoplaria dois módulos por um arquivo de 4 KB.

- [ ] **Step 4: Confirmar que a cópia é byte-idêntica**

```bash
ORIG=poc/caderno-latex:src/modules/caderno/templates/padrao/v1
diff <(git show $ORIG/main.tex)      src/modules/caderno/templates/v1/main.tex      && echo "main.tex OK"
diff <(git show $ORIG/preambulo.tex) src/modules/caderno/templates/v1/preambulo.tex && echo "preambulo.tex OK"
```

Esperado: as duas linhas de OK, sem nenhuma saída de diferença.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS, 7 testes (4 do `it.each` + 3 individuais).

- [ ] **Step 6: Lint e commit**

```bash
npx prettier --write src/modules/caderno/templates.spec.ts
npx eslint src/modules/caderno/templates.spec.ts
git add src/modules/caderno/
git commit -m "feat(caderno): trazer o template LaTeX ja validado para o repo

Copia byte-a-byte da poc/caderno-latex, onde ele foi escrito, compilado
no Overleaf e aprovado. Sem eixo de variante: templates/v1/, nao
padrao/v1/ -- a variante ampliada nao esta neste escopo, e um nivel de
diretorio por algo que nao existe e a complexidade que esta POC corta.

A logo.png e copia e nao referencia cruzada: o \\capaCaderno a busca por
caminho relativo ao main.tex, entao ela precisa estar na raiz do zip."
```

⚠️ Passe **caminhos de arquivo** ao eslint e ao prettier, nunca um diretório: `npx eslint <dir>`
reformata arquivos não relacionados neste repo.

---

### Task 2: Empacotamento — os globs do `nest-cli.json`

**Files:**
- Modify: `nest-cli.json`
- Modify: `src/modules/caderno/templates.spec.ts`

- [ ] **Step 1: Provar que hoje o template NÃO chega no `dist`**

```bash
yarn build && ls dist/modules/caderno/templates/v1/ 2>&1
```

Esperado: `ls: dist/modules/caderno/templates/v1/: No such file or directory`

Este é o bug. Não pule este passo: ele é a metade vermelha da mudança, e é o que prova que os globs
fazem alguma coisa.

- [ ] **Step 2: Acrescentar os três globs**

Substituir o conteúdo de `nest-cli.json` por:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": [
      { "include": "modules/cartao-resposta/assets/**/*.png" },
      { "include": "modules/cartao-resposta/assets/**/*.ttf" },
      {
        "include": "modules/caderno/templates/**/*.tex",
        "exclude": "modules/caderno/templates/**/exemplo/**"
      },
      {
        "include": "modules/caderno/templates/**/*.txt",
        "exclude": "modules/caderno/templates/**/exemplo/**"
      },
      {
        "include": "modules/caderno/templates/**/*.png",
        "exclude": "modules/caderno/templates/**/exemplo/**"
      }
    ]
  }
}
```

⚠️ A entrada de `.png` leva `exclude` mesmo sem imagem no `exemplo/` hoje. As três com a mesma regra
evitam que alguém acrescente uma imagem lá amanhã e ela vá parar no download do coordenador.

- [ ] **Step 3: Confirmar que os quatro chegaram e o exemplo não**

```bash
yarn build && find dist/modules/caderno -type f | sort
```

Esperado, exatamente estes quatro:

```
dist/modules/caderno/templates/v1/LEIA-ME.txt
dist/modules/caderno/templates/v1/logo.png
dist/modules/caderno/templates/v1/main.tex
dist/modules/caderno/templates/v1/preambulo.tex
```

Sem nenhum `exemplo`. Se `exemplo` aparecer, o `exclude` está errado — corrija antes de seguir.

- [ ] **Step 4: Confirmar que o `dist/main.js` não se moveu**

```bash
ls dist/main.js
```

Esperado: `dist/main.js`

Este passo existe por um bug já visto neste repo: arquivo fora de `src/` deslocou o `rootDir` do
TypeScript, o `dist/main.js` mudou de lugar e o PM2 subiu com "Script not found /var/www/main.js". Os
`.tex` não são compilados, então não deveriam causar isso — mas custa um `ls`.

Depois: `rm -rf dist`.

- [ ] **Step 5: Trancar os globs no spec**

Acrescentar a `src/modules/caderno/templates.spec.ts`:

```ts
  it('o nest-cli copia o template pro dist e deixa o exemplo de fora', () => {
    // Lido em runtime, não importado. Um `import` de arquivo fora de `src/`
    // puxa o JSON pro module graph do TypeScript e desloca o `rootDir`
    // inferido: o `dist/main.js` muda de lugar e o PM2 sobe com "Script not
    // found". Já aconteceu neste repo.
    const nestCli = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../nest-cli.json'), 'utf-8'),
    ) as {
      compilerOptions: { assets: { include: string; exclude?: string }[] };
    };

    const doCaderno = nestCli.compilerOptions.assets.filter((a) =>
      a.include.startsWith('modules/caderno/templates'),
    );
    expect(doCaderno.length).toBeGreaterThan(0);
    expect(doCaderno.every((a) => a.exclude?.includes('exemplo'))).toBe(true);

    // Assere o efeito, não a grafia: toda extensão do nível de topo do
    // template precisa estar coberta por um glob. Sem isto, o próximo arquivo
    // posto ali — um `.sty`, uma `exam.cls` vendorizada — some do `dist` com o
    // teste verde, e o defeito só aparece dentro do container.
    //
    // Nível de topo e não recursivo, de propósito: é exatamente o conjunto que
    // viaja no zip. O `exemplo/` está fora por decisão.
    const extensoes = new Set(
      fs
        .readdirSync(TEMPLATE_DIR, { withFileTypes: true })
        .filter((entrada) => entrada.isFile())
        .map((entrada) => path.extname(entrada.name))
        .filter((ext) => ext !== ''),
    );
    expect(extensoes.size).toBeGreaterThan(0);
    extensoes.forEach((ext) =>
      expect(doCaderno.some((a) => a.include.endsWith(`*${ext}`))).toBe(true),
    );
  });
```

- [ ] **Step 6: Provar que a asserção de cobertura morde**

Criar um `src/modules/caderno/templates/v1/estilo.sty` vazio-mas-não-vazio (uma linha de comentário),
rodar a suíte, confirmar que o teste fica **vermelho** apontando a extensão `.sty` descoberta, apagar o
arquivo, confirmar verde. Cole a saída vermelha.

Sem essa prova, a asserção pode estar passando por acidente.

- [ ] **Step 6b: Provar que a asserção do `exclude` morde**

Tire o `exclude` de uma das três entradas do `nest-cli.json`, rode a suíte, confirme que o teste fica
vermelho no `every(... exclude?.includes('exemplo'))`, recoloque, confirme verde. Cole a saída
vermelha.

Depois, a versão de efeito: com o `exclude` removido, rode `yarn build` e confirme que o `exemplo/`
**aparece** no `dist` — é o que a asserção existe para impedir. Restaure e confirme que sumiu.

- [ ] **Step 6c: Confirmar que nada fora do escopo mudou**

```bash
git diff --stat poc/caderno-overleaf..HEAD -- tsconfig.json tsconfig.build.json ms.dockerfile
```

Esperado: **saída vazia.** A spec exige esses três intocados. Se algum aparecer, alguma premissa deste
card foi quebrada e é preciso descobrir qual antes de seguir.

- [ ] **Step 7: Rodar tudo e conferir que nada regrediu**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta
```

Esperado: tudo verde. A mudança no `nest-cli.json` é global, e o `cartao-resposta` depende dos globs
dele — por isso as duas suítes juntas.

- [ ] **Step 8: Lint e commit**

```bash
npx prettier --write src/modules/caderno/templates.spec.ts
npx eslint src/modules/caderno/templates.spec.ts
git add nest-cli.json src/modules/caderno/templates.spec.ts
git commit -m "build(caderno): copiar o template para o dist

Sem isso o template nao existe em producao: o ms.dockerfile faz
'COPY dist ./' e mais nada, e o zip desta POC e autossuficiente -- o
servico le o template em runtime pra po-lo dentro.

O spec assere o efeito e nao a grafia: toda extensao presente no nivel de
topo do template precisa estar coberta por um glob. Senao o proximo
arquivo posto ali some do dist com o teste verde."
```

---

### Task 3: As duas edições no `LEIA-ME.txt` e o aviso no exemplo

**Files:**
- Modify: `src/modules/caderno/templates/v1/LEIA-ME.txt`
- Modify: `src/modules/caderno/templates/v1/exemplo/conteudo.tex`
- Modify: `src/modules/caderno/templates.spec.ts`

O `LEIA-ME.txt` está quase todo correto — descreve "New Project → Upload Project", que é exatamente o
fluxo desta POC. Dois trechos ficaram para trás.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/modules/caderno/templates.spec.ts`:

```ts
  it('o LEIA-ME não aponta para o manifest.json, que não existe nesta POC', () => {
    // Os avisos da geração saem num bloco de `% AVISO:` no topo do
    // conteudo.tex. Apontar para um arquivo que não vem no zip manda a pessoa
    // procurar o que não existe.
    const leiaMe = lerTexto('LEIA-ME.txt');
    expect(leiaMe).not.toContain('manifest.json');
    expect(leiaMe).toContain('% AVISO:');
  });

  it('o LEIA-ME diz como tornar uma mudança de layout permanente', () => {
    // Sem isso alguém ajusta o layout no projeto do Overleaf, imprime
    // satisfeito, e descobre na prova seguinte que o ajuste sumiu — cada
    // projeto é descartável e a fonte da verdade é o repo.
    expect(lerTexto('LEIA-ME.txt')).toMatch(/reposit[óo]rio|repo\b/i);
  });

  it('o conteudo.tex de exemplo avisa que não é modelo da saída do gerador', () => {
    const exemplo = fs.readFileSync(
      path.join(TEMPLATE_DIR, 'exemplo/conteudo.tex'),
      'utf-8',
    );
    expect(exemplo).toContain('não é modelo');
  });
```

- [ ] **Step 2: Rodar e confirmar que os três falham**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: 3 falhas; as demais continuam verdes.

- [ ] **Step 3: Editar a seção "O QUE VOCÊ PODE EDITAR" do `LEIA-ME.txt`**

Substituir:

```
O QUE VOCÊ PODE EDITAR

  main.tex e preambulo.tex são o layout. Mexer é por sua conta, e as
  mudanças ficam só nesta cópia.
```

por:

```
O QUE VOCÊ PODE EDITAR

  main.tex e preambulo.tex são o layout. Mexer é por sua conta, e as
  mudanças ficam só nesta cópia — cada prova que você baixa cria um
  projeto novo, e ele não sabe nada dos anteriores.

  Se a mudança deve valer para todo mundo, daqui em diante, ela precisa
  voltar para o repositório do ms-simulado num pull request. A fonte da
  verdade do template é o repo; este projeto é descartável.
```

- [ ] **Step 4: Editar a seção "AVISOS DA GERAÇÃO" do `LEIA-ME.txt`**

Substituir:

```
AVISOS DA GERAÇÃO

  Veja o manifest.json: ele lista as questões que o gerador não conseguiu
  converter por completo. Confira essas antes de imprimir.
```

por:

```
AVISOS DA GERAÇÃO

  Abra o conteudo.tex e olhe o topo do arquivo. As linhas que começam com
  "% AVISO:" listam o que o gerador não conseguiu resolver — alternativa
  em branco, imagem que não foi encontrada — dizendo o número da questão.
  Confira essas antes de imprimir.

  São comentários de LaTeX: não afetam a compilação nem aparecem no PDF.
```

- [ ] **Step 4b: Corrigir os dois cabeçalhos desatualizados do template**

Achados no review da cópia — os dois mandam o leitor para o lugar errado.

Em `src/modules/caderno/templates/v1/main.tex` e `src/modules/caderno/templates/v1/preambulo.tex`,
trocar na segunda linha:

```
% Caderno de questões — template padrao/v1
```

por:

```
% Caderno de questões — template v1
```

E em `preambulo.tex`, no comentário sobre a logo, trocar `card 05` por `card 04` — a numeração era da
POC anterior; aqui quem monta o zip é o card 04.

⚠️ Isto **quebra de propósito** a byte-identidade com a `poc/caderno-latex` verificada na Task 1. É
esperado: aquela verificação provou que a cópia veio limpa; esta corrige o que já estava errado na
origem. Não desfaça uma pela outra.

- [ ] **Step 5: Pôr o aviso no topo do `exemplo/conteudo.tex`**

Acrescentar como primeiras linhas do arquivo:

```latex
% ===========================================================================
% Smoke test do template — NÃO é modelo da saída do gerador.
%
% Estas questões foram escritas à mão quando existia um conversor de
% markdown, e o gerador desta POC produz outra coisa: ele encaixa o texto da
% questão no molde com escape, sem converter markdown. Use este arquivo para
% provar que o template compila, nunca como especificação do que gerar.
% ===========================================================================
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS, toda a suíte.

- [ ] **Step 7: Confirmar que o `dist` não mudou de forma**

```bash
yarn build && find dist/modules/caderno -type f | sort && ls dist/main.js && rm -rf dist
```

Esperado: os mesmos quatro arquivos, sem `exemplo`, e o `dist/main.js` no lugar.

- [ ] **Step 8: Commit**

```bash
git add src/modules/caderno/
git commit -m "docs(caderno): ajustar o LEIA-ME ao fluxo desta POC

Duas correcoes. O manifest.json nao existe aqui: os avisos saem num
bloco de comentario no topo do conteudo.tex, e o LEIA-ME mandava
procurar um arquivo que nao vem no zip.

E faltava dizer como tornar uma mudanca de layout permanente. Cada
projeto do Overleaf e descartavel, entao ajustar o layout la e imprimir
satisfeito significa descobrir na prova seguinte que o ajuste sumiu.

O conteudo.tex de exemplo ganha um aviso de que e smoke test do
template, nao modelo da saida do gerador."
```

---

### Task 4: Gate manual — compilar no Overleaf

**Files:** nenhum. Esta task não produz commit; ela **para e espera o retorno do usuário**.

É a última vez que essa checagem manual é necessária: do card 04 em diante dá para gerar um caderno de
verdade.

- [ ] **Step 1: Montar o zip achatado**

O `\input{preambulo}` e o `\includegraphics{logo.png}` resolvem relativo ao `main.tex`, então o zip
precisa ser plano.

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-simulado
V=src/modules/caderno/templates/v1
OUT="${TMPDIR:-/tmp}/caderno-template-v1"
rm -rf "$OUT" "$OUT.zip" && mkdir -p "$OUT"

cp "$V/main.tex" "$V/preambulo.tex" "$V/LEIA-ME.txt" "$V/logo.png" "$OUT/"
cp "$V/exemplo/conteudo.tex" "$V/exemplo/metadados.tex" "$OUT/"

(cd "$OUT" && zip -qr ../caderno-template-v1.zip .)
unzip -l "$OUT.zip"
```

Esperado: seis arquivos, todos na raiz.

- [ ] **Step 2: Entregar ao usuário**

Overleaf → *New Project* → *Upload Project* → enviar o zip → compilar o `main.tex`.

- [ ] **Step 3: Checklist de conferência (o usuário responde)**

- [ ] Compila sem erro
- [ ] A primeira questão sai como **QUESTÃO 46**, não 1 — prova que o `\setcounter` sobreviveu à cópia
- [ ] Acentuação correta em todo o texto — prova que a cópia não corrompeu encoding
- [ ] A logo aparece na capa
- [ ] Duas colunas
- [ ] Nenhum cabeçalho "QUESTÃO NN" órfão no pé de coluna

- [ ] **Step 4: Parar e aguardar**

Não seguir sem o retorno. Se algo não compilar, o log do Overleaf é o insumo: colar o trecho relevante,
não só "deu erro".

---

### Task 5: Fechar

> **Resultado do gate (2026-09-07):** o usuário compilou o zip do template no Overleaf e aprovou —
> "ficou bom". Nenhum ajuste necessário: a cópia chegou íntegra, com acentuação e numeração
> preservadas.

- [ ] **Step 1: Corrigir o que a compilação apontar**

Se algo quebrou, é quase certo que foi a cópia — o template compilou nesta forma antes. Comparar de novo
com `diff` contra a branch de origem é o primeiro passo, não editar o arquivo.

- [ ] **Step 2: Rodar a suíte e o build uma última vez**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta
yarn build && find dist/modules/caderno -type f | sort && ls dist/main.js && rm -rf dist
```

- [ ] **Step 3: Abrir o PR contra a branch da POC**

```bash
git push -u origin feature/caderno-00-template-repo
gh pr create --base poc/caderno-overleaf \
  --title "[Caderno · Overleaf] Card 00 — template no repo" \
  --body "Traz para o repo o template LaTeX ja validado — copia byte-a-byte da poc/caderno-latex, onde ele foi escrito, compilado no Overleaf e aprovado.

Sem codigo de runtime: sao arquivos estaticos, tres globs no nest-cli.json e um spec que tranca o contrato de empacotamento.

Por que os globs importam: o ms.dockerfile faz 'COPY dist ./' e mais nada. Como o zip desta POC e autossuficiente (cada geracao vira um projeto novo no Overleaf), o servico le o template em runtime pra po-lo dentro. Template fora do dist some em producao, e a falha so aparece em runtime, dentro do container.

O spec assere o efeito e nao a grafia: toda extensao presente no nivel de topo do template precisa estar coberta por um glob, derivada do disco. Sem isso, o proximo arquivo posto ali some do dist com o teste verde.

Decisoes registradas na spec: sem eixo de variante (templates/v1/, nao padrao/v1/), logo.png copiada em vez de referencia cruzada, exemplo/ fora do pacote, e avisos em bloco de comentario no conteudo.tex em vez de manifest.json.

Validado manualmente no Overleaf.

Spec: docs/superpowers/specs/2026-09-07-caderno-overleaf-template-repo-design.md
Plano: docs/superpowers/plans/2026-09-07-caderno-overleaf-template-repo.md"
```

O `--base` é a POC, **não** a `develop`.

---

## Reflexos nos próximos cards

| Card | O que muda |
|---|---|
| 02 | Emite o bloco de `% AVISO:` no topo do `conteudo.tex`. **Não** existe `manifest.json` |
| 04 | O zip leva `main.tex`, `preambulo.tex`, `logo.png`, `LEIA-ME.txt` (deste card) + `conteudo.tex`, `metadados.tex`, `assets/` (gerados). Tudo na raiz plana, exceto `assets/` |
| 04 | Resolve o template por `path.join(__dirname, 'templates/v1')` a partir de `src/modules/caderno/`. **Sem env de versão** — existe uma versão só |
