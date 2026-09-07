# Caderno LaTeX — Card 01: template `padrao/v1` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar os arquivos de template LaTeX que o zip do caderno vai carregar — layout em duas colunas sobre a classe `exam.cls` — junto com a garantia automatizada de que eles chegam ao container em produção.

**Architecture:** Card sem código de runtime. São arquivos estáticos em `src/modules/caderno/templates/padrao/v1/`, mais dois globs no `nest-cli.json` que os copiam pro `dist`. O único código é um `.spec.ts` que trava o contrato de empacotamento: ele resolve o mesmo caminho que o `CadernoService` (card 05) vai usar e falha se algum arquivo do zip sumir. Quem lê esses arquivos em runtime é o card 05, não este.

**Tech Stack:** LaTeX (classe `exam.cls`, engine de referência pdfLaTeX), NestJS 10 (`nest-cli.json` assets), Jest 29 + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-06-caderno-latex-template-v1-design.md` (commit `14a630a`)

---

## Contexto que o plano assume

**Não há distribuição TeX nesta máquina, e a decisão foi não instalar.** A validação de layout é manual, no Overleaf, feita pelo usuário. Isso muda a forma do plano: as Tasks 1-3 produzem os arquivos e travam o que dá pra travar sem compilador; a Task 4 é um **gate manual** que para e espera o retorno do usuário; a Task 5 consolida o que a compilação real revelou.

O maior risco do card é que `\documentclass[twocolumn]{exam}` não está testado. Por isso o fixture leva **dois** `main` — um com a opção da classe, outro com `multicol` — pra que um único upload resolva a dúvida. O perdedor é apagado na Task 5.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/templates/padrao/v1/preambulo.tex` | Pacotes, macros do caderno, estilo das questões, rodapé, `\capaCaderno`. Vai no zip. |
| `src/modules/caderno/templates/padrao/v1/main.tex` | Classe, ordem dos `\input`, marca d'água condicional, ambiente `questions`. Vai no zip. |
| `src/modules/caderno/templates/padrao/v1/LEIA-ME.txt` | Como compilar, como tirar o gabarito, o que não editar. Vai no zip. |
| `src/modules/caderno/templates/padrao/v1/exemplo/metadados.tex` | Fixture: as macros que o card 03 vai gerar. **Não** vai no zip. |
| `src/modules/caderno/templates/padrao/v1/exemplo/conteudo.tex` | Fixture: 6 questões sintéticas, uma por risco de layout. **Não** vai no zip. |
| `src/modules/caderno/templates/padrao/v1/exemplo/main-multicol.tex` | Plano B do layout de duas colunas, pra compilar no mesmo upload. **Não** vai no zip. |
| `src/modules/caderno/templates.spec.ts` | Contrato de empacotamento: caminho, presença dos arquivos e as duas armadilhas silenciosas (`normalem`, `fancyhdr`). |
| `nest-cli.json` | Dois globs novos, com `exclude` do `exemplo/`. |

A `logo.png` **não** é criada aqui: a fonte é `src/modules/cartao-resposta/assets/logo.png` e quem a copia pra raiz do zip é o card 05. No smoke test deste card ela entra junto no upload.

---

## Setup

- [ ] **Criar a branch de desenvolvimento a partir da POC**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-simulado
git checkout poc/caderno-latex
git checkout -b feature/caderno-01-template-v1
git branch --show-current
```

Esperado: `feature/caderno-01-template-v1`

---

### Task 1: Contrato de empacotamento + os três arquivos do zip

**Files:**
- Create: `src/modules/caderno/templates.spec.ts`
- Create: `src/modules/caderno/templates/padrao/v1/preambulo.tex`
- Create: `src/modules/caderno/templates/padrao/v1/main.tex`
- Create: `src/modules/caderno/templates/padrao/v1/LEIA-ME.txt`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/templates.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * Contrato de empacotamento do template do caderno.
 *
 * O caminho testado aqui é o mesmo que o CadernoService (card 05) vai usar:
 * `path.join(__dirname, 'templates/padrao/v1')` a partir de
 * `src/modules/caderno/`. O `ms.dockerfile` faz `COPY dist ./`, então um
 * template fora de `src/` — ou fora dos globs do `nest-cli.json` — não
 * chegaria em produção, e a falha só apareceria em runtime, no container.
 */
const TEMPLATE_DIR = path.join(__dirname, 'templates/padrao/v1');

/** Os arquivos que o card 05 copia pro zip. O `exemplo/` não entra. */
const ARQUIVOS_DO_ZIP = ['main.tex', 'preambulo.tex', 'LEIA-ME.txt'];

const ler = (arquivo: string): string =>
  fs.readFileSync(path.join(TEMPLATE_DIR, arquivo), 'utf-8');

describe('template do caderno (padrao/v1)', () => {
  it.each(ARQUIVOS_DO_ZIP)('%s existe e não está vazio', (arquivo) => {
    expect(ler(arquivo).trim().length).toBeGreaterThan(0);
  });

  it('main.tex usa a exam.cls em duas colunas', () => {
    expect(ler('main.tex')).toContain(
      '\\documentclass[11pt,a4paper,twocolumn]{exam}',
    );
  });

  it('main.tex encaixa preambulo, metadados e conteudo nessa ordem', () => {
    const main = ler('main.tex');
    const posicoes = ['preambulo', 'metadados', 'conteudo'].map((nome) =>
      main.indexOf(`\\input{${nome}}`),
    );
    expect(posicoes.every((i) => i >= 0)).toBe(true);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it('preambulo carrega ulem com [normalem]', () => {
    // Sem normalem o ulem sequestra o \emph e sublinha todo itálico — e o
    // conversor (card 02) mapeia ênfase para \emph. Falha silenciosa: só
    // aparece olhando o PDF.
    expect(ler('preambulo.tex')).toContain('\\usepackage[normalem]{ulem}');
  });

  it('preambulo não usa fancyhdr, que conflita com a exam.cls', () => {
    expect(ler('preambulo.tex')).not.toContain('fancyhdr');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: FAIL, `ENOENT: no such file or directory` apontando para `templates/padrao/v1/main.tex`.

- [ ] **Step 3: Criar o `preambulo.tex`**

Criar `src/modules/caderno/templates/padrao/v1/preambulo.tex`:

```latex
% ===========================================================================
% Caderno de questões — template padrao/v1
% Preâmbulo: pacotes, macros e estilo. Layout mora aqui e no main.tex,
% nunca no conteúdo gerado.
%
% Engine de referência: pdfLaTeX (o default do Overleaf). Se um dia a
% compilação server-side (card 08) virar XeTeX/Tectonic, trocar
% inputenc/fontenc por fontspec.
% ===========================================================================

% --- macros do caderno -----------------------------------------------------
% Declaradas antes de qualquer uso: o \footer abaixo já usa \cadernoTitulo.
% O metadados.tex gerado sobrescreve estes defaults com \def.
\newif\ifcadernorascunho
\providecommand{\cadernoTitulo}{Caderno de Questões}
\providecommand{\cadernoSubtitulo}{}
\providecommand{\cadernoPendencias}{}

% --- idioma e codificação --------------------------------------------------
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[brazil]{babel}

% --- geometria -------------------------------------------------------------
\usepackage[a4paper,margin=2cm,columnsep=0.8cm]{geometry}

% --- conteúdo --------------------------------------------------------------
\usepackage{graphicx}
\usepackage[export]{adjustbox}   % max width=\linewidth: encolhe, nunca amplia
\usepackage{amsmath,amssymb}
\usepackage{enumitem}
\usepackage{tabularx,booktabs}
% [normalem] é OBRIGATÓRIO: sem ele o ulem sequestra o \emph e sublinha todo
% itálico, e o conversor do card 02 mapeia ênfase para \emph.
\usepackage[normalem]{ulem}
\usepackage{needspace}
\usepackage{xcolor}

% --- estilo das questões (exam.cls) ----------------------------------------
\renewcommand\choicelabel{(\Alph{choice})}
\qformat{\noindent\textbf{QUESTÃO \thequestion}\hfill}

% --- rodapé ----------------------------------------------------------------
% Mecanismo nativo da exam.cls. Não usar fancyhdr: conflita com a classe.
\pagestyle{headandfoot}
\footer{}{\small\cadernoTitulo\ --- \thepage}{}

% --- capa ------------------------------------------------------------------
% Usada como \twocolumn[\capaCaderno] no main.tex, o que a faz atravessar as
% duas colunas no topo da página 1.
\newcommand{\capaCaderno}{%
  \begin{center}
    \includegraphics[height=1.1cm]{logo.png}\\[0.4em]
    {\LARGE\bfseries\cadernoTitulo}\\[0.3em]
    {\large\cadernoSubtitulo}
  \end{center}
  \ifcadernorascunho
    \begin{center}\small\textbf{RASCUNHO} --- pendências: \cadernoPendencias\end{center}
  \fi
  \vspace{0.3em}\hrule\vspace{0.4em}
  {\small Marque suas respostas no cartão-resposta.}
  \vspace{0.6em}\hrule\vspace{1em}
}
```

- [ ] **Step 4: Criar o `main.tex`**

Criar `src/modules/caderno/templates/padrao/v1/main.tex`:

```latex
% ===========================================================================
% Caderno de questões — template padrao/v1
%
% Compile:  latexmk -pdf main.tex      (ou suba esta pasta no Overleaf)
%
% Gabarito do professor: troque a linha do \documentclass abaixo por
%   \documentclass[11pt,a4paper,twocolumn,answers]{exam}
% e recompile. A alternativa correta sai destacada.
%
% NÃO EDITE os arquivos metadados.tex e conteudo.tex: os dois são gerados
% pelo ms-simulado e sobrescritos a cada download.
% ===========================================================================
\documentclass[11pt,a4paper,twocolumn]{exam}

\input{preambulo}
\input{metadados}

% draftwatermark carregado só no modo rascunho: carregá-lo sempre estampa
% "DRAFT" por padrão.
\ifcadernorascunho
  \usepackage{draftwatermark}
  \SetWatermarkText{RASCUNHO}
  \SetWatermarkScale{1.2}
  \SetWatermarkColor[gray]{0.92}
\fi

\begin{document}

\twocolumn[\capaCaderno]

\begin{questions}
\input{conteudo}
\end{questions}

\end{document}
```

- [ ] **Step 5: Criar o `LEIA-ME.txt`**

Criar `src/modules/caderno/templates/padrao/v1/LEIA-ME.txt`:

```
Caderno de questões — pacote LaTeX gerado pelo ms-simulado
==========================================================

COMO COMPILAR

  Opção 1 — Overleaf, sem instalar nada
    1. Acesse overleaf.com e crie um projeto por "New Project > Upload Project"
    2. Envie este .zip inteiro
    3. Abra main.tex e clique em "Recompile"

  Opção 2 — na sua máquina, com uma distribuição TeX instalada
    latexmk -pdf main.tex

GABARITO DO PROFESSOR

  Abra main.tex e troque a linha
      \documentclass[11pt,a4paper,twocolumn]{exam}
  por
      \documentclass[11pt,a4paper,twocolumn,answers]{exam}
  e recompile. A alternativa correta de cada questão sai destacada.
  Desfaça a troca para voltar à prova do aluno.

O QUE VOCÊ PODE EDITAR

  main.tex e preambulo.tex são o layout. Mexer é por sua conta, e as
  mudanças ficam só nesta cópia.

O QUE VOCÊ NÃO DEVE EDITAR

  metadados.tex e conteudo.tex são gerados a partir do simulado cadastrado
  na plataforma. Qualquer alteração aqui se perde no próximo download e,
  o que importa mais, não volta para a plataforma. Se uma questão está
  errada ou saiu mal diagramada, corrija a questão na plataforma e baixe
  o caderno de novo.

AVISOS DA GERAÇÃO

  Veja o manifest.json: ele lista as questões que o gerador não conseguiu
  converter por completo. Confira essas antes de imprimir.
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS, 7 testes (3 do `it.each` + 4 individuais).

- [ ] **Step 7: Lint e formatação do arquivo novo**

```bash
npx prettier --write src/modules/caderno/templates.spec.ts
npx eslint src/modules/caderno/templates.spec.ts
```

Esperado: nenhuma saída do eslint.

⚠️ Passar **o caminho do arquivo**, nunca um diretório: `yarn lint` e `npx eslint <dir>` reformatam arquivos não relacionados neste repo.

- [ ] **Step 8: Commit**

```bash
git add src/modules/caderno/
git commit -m "feat(caderno): template LaTeX padrao/v1 sobre exam.cls

main.tex, preambulo.tex e LEIA-ME.txt: os tres arquivos que vao no zip.
Duas colunas via opcao da classe, capa de largura total com \\twocolumn[],
rodape pelo mecanismo nativo da exam.cls (sem fancyhdr).

O spec trava o contrato de empacotamento pelo mesmo caminho que o card 05
vai usar, e guarda duas armadilhas silenciosas: ulem sem [normalem]
sublinha todo italico, e fancyhdr conflita com a classe."
```

---

### Task 2: Globs do `nest-cli.json` (o template tem que chegar no `dist`)

**Files:**
- Modify: `nest-cli.json`

- [ ] **Step 1: Provar que hoje o template NÃO chega no `dist`**

```bash
yarn build && ls dist/modules/caderno/templates/padrao/v1/ 2>&1
```

Esperado: `ls: dist/modules/caderno/templates/padrao/v1/: No such file or directory`

Este é o bug que o card original teria levado pra produção: sem os globs, o `ms.dockerfile` (`COPY dist ./`) sobe uma imagem sem template, e o card 05 quebra em runtime.

- [ ] **Step 2: Adicionar os dois globs**

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
      { "include": "modules/caderno/templates/**/*.txt" }
    ]
  }
}
```

- [ ] **Step 3: Confirmar que os três arquivos do zip chegaram**

```bash
yarn build && ls dist/modules/caderno/templates/padrao/v1/
```

Esperado: `LEIA-ME.txt`, `main.tex`, `preambulo.tex`.

- [ ] **Step 4: Confirmar que o `main.js` continua na raiz do `dist`**

```bash
ls dist/main.js
```

Esperado: `dist/main.js`

Este passo existe por um bug já visto neste repo: arquivo fora de `src/` desloca o `rootDir` do TypeScript, o `dist/main.js` muda de lugar e o PM2 sobe com "Script not found /var/www/main.js". Os `.tex` não são compilados, então não deveriam causar isso — mas custa um `ls` confirmar.

- [ ] **Step 5: Commit**

```bash
git add nest-cli.json
git commit -m "build(caderno): copiar o template .tex/.txt para o dist

Sem isso o template nao existe em producao: o ms.dockerfile faz
'COPY dist ./' e mais nada. O exclude mantem o exemplo/ fora do pacote."
```

---

### Task 3: Fixture do smoke test (`exemplo/`)

**Files:**
- Create: `src/modules/caderno/templates/padrao/v1/exemplo/metadados.tex`
- Create: `src/modules/caderno/templates/padrao/v1/exemplo/conteudo.tex`
- Create: `src/modules/caderno/templates/padrao/v1/exemplo/main-multicol.tex`

Conteúdo **sintético**, escrito à mão. Não é amostra do acervo — é fixture de template, e cada questão existe por causa de um risco de layout específico.

- [ ] **Step 1: Criar o `exemplo/metadados.tex`**

```latex
% Fixture do smoke test — imita o que o card 03 vai GERAR.
\def\cadernoTitulo{Simulado de Exemplo --- Template v1}
\def\cadernoSubtitulo{ENEM 1º dia $\cdot$ 6 questões $\cdot$ 90 min}
\def\cadernoPendencias{52, 58}
% Descomente para testar a marca d'água e a caixa de pendências:
% \cadernorascunhotrue
```

- [ ] **Step 2: Criar o `exemplo/conteudo.tex`**

```latex
% Fixture do smoke test do template padrao/v1. Conteúdo SINTÉTICO, escrito à
% mão — não é amostra do acervo. Cada questão exercita um risco de layout.

% (1) Texto curto + numeração real: tem que sair "QUESTÃO 46", não 1.
%     Carrega também o sampler de formatação inline: se o ulem tiver sido
%     carregado sem [normalem], o "itálico" abaixo sai SUBLINHADO.
\needspace{6\baselineskip}
\setcounter{question}{45}
\question Leia com atenção: \textbf{negrito}, \emph{itálico}, \sout{tachado} e
\texttt{monoespaçado}. A capital do Brasil é:
\begin{choices}
  \choice São Paulo
  \choice Rio de Janeiro
  \CorrectChoice Brasília
  \choice Salvador
  \choice Belo Horizonte
\end{choices}

% (2) Fórmula inline e em display.
\needspace{6\baselineskip}
\setcounter{question}{46}
\question Considere a função $f(x) = x^2 - 4$. Sabendo que
$$\int_{0}^{1} x \, dx = \frac{1}{2},$$
as raízes de $f$ são:
\begin{choices}
  \choice $x = 0$ e $x = 4$
  \CorrectChoice $x = -2$ e $x = 2$
  \choice $x = -4$ e $x = 4$
  \choice $x \in \emptyset$
  \choice $x = 1$ e $x = -1$
\end{choices}

% (3) Imagem larga no enunciado: o adjustbox tem que encolher pra coluna.
\needspace{10\baselineskip}
\setcounter{question}{47}
\question Observe a imagem a seguir.

\includegraphics[max width=\linewidth]{logo.png}

A imagem acima é:
\begin{choices}
  \CorrectChoice Uma logomarca
  \choice Um gráfico de barras
  \choice Um mapa topográfico
  \choice Uma fotografia aérea
  \choice Uma tabela periódica
\end{choices}

% (4) Alternativa que é imagem.
\needspace{10\baselineskip}
\setcounter{question}{48}
\question Qual das alternativas a seguir contém uma imagem?
\begin{choices}
  \choice Apenas texto simples
  \CorrectChoice \includegraphics[max width=\linewidth]{logo.png}
  \choice Outro texto simples
  \choice Mais um texto
  \choice Nenhuma das anteriores
\end{choices}

% (5) Tabela: tabularx numa coluna de ~8 cm é o caso mais apertado do layout.
\needspace{12\baselineskip}
\setcounter{question}{49}
\question A tabela mostra a produção de três estados em 2025:

\begin{tabularx}{\linewidth}{@{}lXr@{}}
  \toprule
  Estado & Produto & Total \\
  \midrule
  Bahia  & Cacau   & 120 \\
  Pará   & Açaí    & 340 \\
  Goiás  & Soja    & 890 \\
  \bottomrule
\end{tabularx}

O estado com maior produção é:
\begin{choices}
  \choice Bahia
  \choice Pará
  \CorrectChoice Goiás
  \choice Todos empataram
  \choice Não é possível determinar
\end{choices}

% (6) Enunciado longo: tem que atravessar a quebra de coluna sem deixar o
% cabeçalho "QUESTÃO 51" órfão no pé da coluna anterior.
\needspace{6\baselineskip}
\setcounter{question}{50}
\question A urbanização brasileira acelerou a partir da segunda metade do
século XX, quando o país deixou de ser majoritariamente rural em pouco mais
de três décadas. Esse deslocamento populacional não foi acompanhado, na
mesma velocidade, por investimento em saneamento, transporte e moradia, o
que produziu cidades que cresceram pelas bordas, muitas vezes sobre áreas
de risco ou de proteção ambiental.

O resultado é uma malha urbana em que a distância entre o lugar onde as
pessoas moram e o lugar onde trabalham aumentou de forma consistente,
empurrando para o transporte coletivo uma demanda que ele não foi
planejado para absorver. Em várias capitais, o tempo médio de deslocamento
diário superou duas horas, com impacto direto sobre renda, saúde e
escolaridade da população periférica.

Com base no texto, a principal causa do padrão descrito é:
\begin{choices}
  \choice A redução da população rural por causas naturais
  \CorrectChoice O descompasso entre crescimento urbano e investimento em infraestrutura
  \choice A diminuição da oferta de empregos nos centros urbanos
  \choice O aumento da área de proteção ambiental nas capitais
  \choice A migração de retorno das cidades para o campo
\end{choices}
```

- [ ] **Step 3: Criar o `exemplo/main-multicol.tex`**

```latex
% ===========================================================================
% PLANO B do card 01 — só existe para o smoke test.
%
% Se \documentclass[twocolumn]{exam} (o main.tex) não funcionar, este arquivo
% faz as duas colunas com o pacote multicol. Compile OS DOIS no mesmo upload
% e mantenha só o que funcionar melhor; o perdedor é apagado antes do PR.
%
% Só compila a partir do zip montado (onde tudo está no mesmo diretório),
% não de dentro de exemplo/.
% ===========================================================================
\documentclass[11pt,a4paper]{exam}

\input{preambulo}
\input{metadados}
\usepackage{multicol}

\ifcadernorascunho
  \usepackage{draftwatermark}
  \SetWatermarkText{RASCUNHO}
  \SetWatermarkScale{1.2}
  \SetWatermarkColor[gray]{0.92}
\fi

\begin{document}

\capaCaderno

\begin{multicols}{2}
\begin{questions}
\input{conteudo}
\end{questions}
\end{multicols}

\end{document}
```

- [ ] **Step 4: Confirmar que o `exemplo/` NÃO vaza pro `dist`**

```bash
yarn build && ls dist/modules/caderno/templates/padrao/v1/
```

Esperado: exatamente `LEIA-ME.txt`, `main.tex`, `preambulo.tex`. **Sem** `exemplo`.

Se `exemplo` aparecer, o `exclude` do Step 2 da Task 2 está errado — corrigir antes de seguir.

- [ ] **Step 5: Rodar a suíte do módulo e confirmar que segue verde**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/caderno/templates/padrao/v1/exemplo/
git commit -m "test(caderno): fixture sintetica para o smoke test do template

6 questoes, uma por risco de layout: numeracao real (46), formula inline e
display, imagem larga, alternativa que e imagem, tabularx na coluna estreita
e enunciado que atravessa a quebra de coluna.

Leva dois main: o da opcao twocolumn da classe e o de multicol. exam.cls
aceitar twocolumn e a hipotese nao testada do card, e sem TeX local os dois
vao no mesmo upload pra resolver a duvida numa rodada so."
```

---

### Task 4: Gate manual — montar o zip e validar no Overleaf

**Files:** nenhum. Esta task não produz commit; ela **para e espera o retorno do usuário**.

- [ ] **Step 1: Montar o zip com tudo achatado num diretório só**

O `\input{preambulo}` e o `\includegraphics{logo.png}` resolvem relativo ao `main.tex`, então o zip precisa ser plano — os arquivos do template, os do `exemplo/` e a logo lado a lado.

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-simulado
OUT="${TMPDIR:-/tmp}/caderno-overleaf"
rm -rf "$OUT" && mkdir -p "$OUT"
cp src/modules/caderno/templates/padrao/v1/main.tex       "$OUT/"
cp src/modules/caderno/templates/padrao/v1/preambulo.tex  "$OUT/"
cp src/modules/caderno/templates/padrao/v1/LEIA-ME.txt    "$OUT/"
cp src/modules/caderno/templates/padrao/v1/exemplo/*.tex  "$OUT/"
cp src/modules/cartao-resposta/assets/logo.png            "$OUT/"
(cd "$OUT" && zip -qr ../caderno-overleaf.zip .)
ls -la "${TMPDIR:-/tmp}/caderno-overleaf.zip"
```

Esperado: o zip existe, com 7 arquivos (`main.tex`, `main-multicol.tex`, `preambulo.tex`, `metadados.tex`, `conteudo.tex`, `LEIA-ME.txt`, `logo.png`).

- [ ] **Step 2: Entregar o zip ao usuário com o roteiro**

Overleaf → *New Project* → *Upload Project* → enviar o zip. Compilar **os dois** `main`:

1. `main.tex` — compilar e conferir a lista abaixo
2. `main-multicol.tex` — no Overleaf, definir como documento principal em *Menu > Main document*, recompilar e conferir a mesma lista
3. `main.tex` de novo, trocando o `\documentclass` por `[11pt,a4paper,twocolumn,answers]{exam}` — conferir o gabarito
4. `metadados.tex`, descomentando `\cadernorascunhotrue` — conferir a marca d'água

- [ ] **Step 3: Checklist de conferência (o usuário responde)**

- [ ] Compila sem erro
- [ ] A primeira questão sai como **QUESTÃO 46**, não 1
- [ ] Com `answers`, a alternativa correta sai destacada
- [ ] A imagem da questão 48 não estoura a largura da coluna
- [ ] Nenhum cabeçalho "QUESTÃO NN" órfão no pé de coluna (olhar a 51, que é longa)
- [ ] A tabela da questão 50 cabe na coluna e continua legível
- [ ] Na questão 46, **"itálico" sai em itálico e não sublinhado** — é o teste do `[normalem]`; se sair sublinhado, o `preambulo.tex` perdeu a opção
- [ ] Marca d'água aparece com `\cadernorascunhotrue` e some sem ela
- [ ] O rodapé traz o título do simulado e o número da página
- [ ] A capa atravessa as duas colunas no topo da página 1
- [ ] **Qual dos dois `main` ficou melhor**

- [ ] **Step 4: Parar e aguardar**

Não seguir para a Task 5 sem o retorno. Se algo não compilar, a mensagem de erro do Overleaf é o insumo do ajuste — colar o trecho relevante do log, não só "deu erro".

---

### Task 5: Consolidar o resultado da compilação

**Files:**
- Delete: o `main` perdedor (um dos dois)
- Modify: o que a compilação apontar

- [ ] **Step 1: Apagar o `main` perdedor**

Se o `main.tex` (opção `twocolumn` da classe) venceu — o caso esperado:

```bash
git rm src/modules/caderno/templates/padrao/v1/exemplo/main-multicol.tex
```

Se o `multicol` venceu, o `main-multicol.tex` vira o `main.tex` do template:

```bash
git mv src/modules/caderno/templates/padrao/v1/exemplo/main-multicol.tex \
       src/modules/caderno/templates/padrao/v1/main.tex
```

e, neste caso, ajustar `templates.spec.ts`: a asserção `\documentclass[11pt,a4paper,twocolumn]{exam}` passa a ser `\documentclass[11pt,a4paper]{exam}`, e vale acrescentar `expect(ler('main.tex')).toContain('\\begin{multicols}{2}')`.

- [ ] **Step 2: Aplicar os ajustes de layout que a compilação apontou**

Cada ajuste mora em `preambulo.tex` (estilo, pacotes, capa, rodapé) ou `main.tex` (estrutura). O conteúdo gerado não muda — é essa separação que torna o ajuste de layout barato.

- [ ] **Step 3: Rodar o teste e confirmar que segue verde**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS.

- [ ] **Step 4: Confirmar o `dist` uma última vez**

```bash
yarn build && ls dist/modules/caderno/templates/padrao/v1/ && ls dist/main.js
```

Esperado: os três arquivos do zip, sem `exemplo`, e `dist/main.js` no lugar.

- [ ] **Step 5: Commit**

Se venceu o `main.tex` (opção `twocolumn` da classe):

```bash
git add -A src/modules/caderno/
git commit -m "fix(caderno): ajustes de layout apos a compilacao no Overleaf

As duas colunas ficam pela opcao twocolumn da exam.cls. Removido o
main-multicol.tex, que era o plano B do smoke test."
```

Se venceu o `multicol`:

```bash
git add -A src/modules/caderno/
git commit -m "fix(caderno): duas colunas via multicol apos a compilacao

A exam.cls nao aceitou a opcao twocolumn. As colunas passam a vir do
pacote multicol em volta do ambiente questions, e o spec foi ajustado
para travar essa forma."
```

⚠️ Usar `git add -A src/modules/caderno/` (com o caminho), nunca `git add -A` puro: já houve neste projeto um commit acidental de arquivo não rastreado do usuário.

- [ ] **Step 6: Abrir o PR contra a branch da POC**

```bash
git push -u origin feature/caderno-01-template-v1
gh pr create --base poc/caderno-latex \
  --title "[Caderno LaTeX] Card 01 — template padrao/v1 sobre exam.cls" \
  --body "Card 01 da etapa Caderno LaTeX. Entrega os arquivos de template que o
zip do caderno vai carregar: layout em duas colunas sobre a classe exam.cls.

Sem codigo de runtime — arquivos estaticos mais dois globs no nest-cli.json.
Quem le esses arquivos e o card 05.

Dois desvios do que o card escrevia, ambos justificados na spec:

- O template desce pra dentro de src/ em vez da raiz do repo. Na raiz ele nao
  chegaria em producao: o ms.dockerfile faz \`COPY dist ./\` e mais nada. O
  spec novo trava esse contrato pelo mesmo caminho que o card 05 vai usar.
- O arquivo gerado vira dois (metadados.tex + conteudo.tex), porque a capa
  precisa do titulo antes das questoes serem diagramadas. Reflete no card 03.

Validado manualmente no Overleaf (nao ha TeX na maquina de desenvolvimento).

Spec: docs/superpowers/specs/2026-09-06-caderno-latex-template-v1-design.md
Plano: docs/superpowers/plans/2026-09-06-caderno-latex-template-v1.md"
```

O `--base` é a branch da POC, **não** a `develop`. O PR de volta pra `develop` é o da `poc/caderno-latex`, e só no fim da etapa.

---

## Reflexos a propagar nos próximos cards

Anotados aqui porque este card os descobriu; aplicar quando cada um chegar.

| Card | O que muda |
|---|---|
| 03 | Gera **dois** arquivos — `metadados.tex` (macros) e `conteudo.tex` (só questões). O `\begin{questions}` sai do conteúdo e fica no `main.tex`. |
| 05 | O zip leva `main.tex`, `preambulo.tex`, `LEIA-ME.txt`, `metadados.tex`, `conteudo.tex`, `logo.png` (copiada de `cartao-resposta/assets/`) e `assets/`. |
| 05 | Env ganha `CADERNO_TEMPLATE=padrao` ao lado de `CADERNO_TEMPLATE_VERSION=v1`. |
| 05 | O loader resolve `path.join(__dirname, 'templates', template, versao)` — o mesmo caminho que o `templates.spec.ts` já trava. |
