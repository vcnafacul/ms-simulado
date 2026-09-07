# Caderno LaTeX — Card 01: template `padrao/v1` sobre `exam.cls`

**Data:** 2026-09-06
**Origem:** `vcnafacul-3/docs/prova-latex/cards/01-template-latex-v1.md`
**Etapa:** Caderno LaTeX (`vcnafacul-3/docs/prova-latex/design.md`)
**Repos afetados:** `ms-simulado` (só este)
**Branch base:** `poc/caderno-latex`

## Contexto

Um simulado custom não tem PDF — é só um conjunto de questões no Mongo. O cartão-resposta OMR
(etapa 7) já é gerado sob demanda; falta o caderno que o aluno responde. A etapa entrega um zip com
os fontes LaTeX de um simulado, e este card entrega **o layout**: os arquivos de template que o zip
carrega e dentro dos quais o conteúdo gerado (cards 02/03) é encaixado.

Não é spike nem investigação. A pesquisa (`estado-da-arte.md §1`) já escolheu a base: a classe
[`exam`](https://ctan.org/pkg/exam) (v2.704, mantida, LPPL), que resolve de graça o requisito mais
chato da feature — imprimir o **número real** da questão (`\setcounter{question}{45}` → "QUESTÃO 46"),
que é o que faz o caderno casar com o cartão-resposta nos blocos 46..90 do ENEM. E, com
`\documentclass[answers]{exam}` + `\CorrectChoice`, o gabarito do professor sai do mesmo fonte.

Card 01 **não tem código de runtime**: são arquivos estáticos mais uma linha de configuração de build.
Fluxo de dados e tratamento de erro aparecem no card 05, quando alguém for ler esses arquivos.

## Decisões tomadas neste brainstorm

| Decisão | Escolha | Por quê |
|---|---|---|
| Colunas na v1 | **Duas**, padrão ENEM | Foi o pedido de quem solicitou a feature. Custo de impressão é responsabilidade do cursinho, não nossa. |
| Variantes futuras | `padrao` (2 col.) e `ampliada` (1 col., corpo grande) | A ampliada é o padrão de acessibilidade do ENEM. Só a `padrao` é implementada agora. |
| Estrutura de diretório | `templates/<variante>/<versão>/` | Dois eixos explícitos. A ampliada difere em mais que colunas (corpo 18-24pt, margem, dimensionamento de imagem); como arquivos separados, cada um é legível sozinho e um não quebra o outro. |
| Onde os arquivos moram | Dentro de `src/`, com globs no `nest-cli.json` | **Obrigatório, não preferência** — ver "O achado que motivou a mudança de caminho". |
| Conteúdo largo (imagem/tabela) | Nunca flutua; encolhe pra largura da coluna | Numa prova a imagem não pode se separar da questão. Float em LaTeX se move por definição — separar imagem do enunciado é o modo de falha mais caro possível. Legibilidade ruim é diagramação, e diagramação é do usuário (design §4). |
| Abertura do caderno | Cabeçalho de largura total na página 1, via `\twocolumn[...]` | Mecanismo nativo da classe pra conteúdo que atravessa as colunas. Não gasta folha e não duplica nome/matrícula, que vivem no cartão-resposta — que é onde o OMR lê. |
| Engine de referência | **pdfLaTeX** | Decorre de validar no Overleaf (default de lá) e é coerente com o card 08, que escolheu TeX Live + `pdflatex`. Libera `inputenc`/`fontenc`. |
| Logo | `src/modules/cartao-resposta/assets/logo.png` | Já no repo, já copiada pro `dist`, mesma marca que o cartão estampa. Sem binário novo. |
| Logo do cursinho | Fora da v1 | Confirmado no código: `nomeCursinho` existe no builder do cartão mas nunca é preenchido no fluxo real (só no script de amostra). O `ms-simulado` só tem o `cursinhoId`. |

## O achado que motivou a mudança de caminho

O card e o `design.md §6.1` colocavam o template em `ms-simulado/templates/caderno/v1/`, na raiz do
repo. **Isso não sobreviveria ao deploy.** O `ms.dockerfile` faz:

```dockerfile
COPY dist ./
COPY package.json .
```

Só o `dist` entra na imagem. Uma pasta `templates/` na raiz simplesmente não existiria em produção, e
a falha apareceria no card 05 — em runtime, no container, não no build.

O precedente correto já existe no repo: o `cartao-resposta` guarda seus assets em
`src/modules/cartao-resposta/assets/`, registra os globs em `nest-cli.json` e lê com
`path.join(__dirname, '../assets/...')` (ver `pdf/cartao-pdf.builder.ts:31,43,48`). Como o
`COPY dist ./` achata o `dist` em `/var/www`, o `__dirname` de
`dist/modules/caderno/caderno.service.js` é `/var/www/modules/caderno` — e o caminho relativo fecha.

Este card segue esse precedente e transforma a garantia em critério de aceitação automatizável.

## Arquitetura

### Arquivos

```
src/modules/caderno/templates/padrao/v1/
├── main.tex          ← vai no zip
├── preambulo.tex     ← vai no zip
├── LEIA-ME.txt       ← vai no zip
└── exemplo/          ← NÃO vai no zip: smoke test deste card
    ├── metadados.tex
    ├── conteudo.tex
    └── main-multicol.tex
```

**A `logo.png` não mora aqui.** O `\capaCaderno` faz `\includegraphics{logo.png}`, um caminho relativo
ao `main.tex` — então o arquivo precisa estar **ao lado dele na raiz do zip**. A fonte é
`src/modules/cartao-resposta/assets/logo.png`, e quem copia é o card 05, ao montar o zip. Para o smoke
test deste card, a logo entra junto no upload do Overleaf. ➡️ **Reflete no card 05:** o zip ganha
`logo.png` na raiz, além dos arquivos já listados no `design.md §5`.

`nest-cli.json` ganha dois globs ao lado dos que o cartão já tem:

```json
{ "include": "modules/caderno/templates/**/*.tex", "exclude": "**/exemplo/**" },
{ "include": "modules/caderno/templates/**/*.txt" }
```

### Mudança de contrato: `metadados.tex` separado de `conteudo.tex`

O `design.md §5.2` põe os `\def\cadernoTitulo{...}` e as questões no mesmo arquivo gerado. **Isso não
fecha:** a capa precisa do título antes de ser diagramada, e as questões vêm depois dela. Um arquivo só
força uma das duas coisas erradas — ou a capa sai sem título, ou o `\capaCaderno` vai parar dentro do
arquivo gerado, e aí layout deixa de morar só no `main.tex`.

São **dois** arquivos gerados:

- `metadados.tex` — só as macros (`\def\cadernoTitulo`, `\def\cadernoSubtitulo`, `\cadernorascunhotrue`,
  `\def\cadernoPendencias`). Lido no **preâmbulo**, antes do `\begin{document}`.
- `conteudo.tex` — só os blocos de questão. Sem `\begin{questions}`: o ambiente subiu pro `main.tex`,
  então o arquivo gerado não carrega nenhuma estrutura de layout.

➡️ **Reflete nos cards 03 e 05** (dois arquivos gerados em vez de um, e o `\begin{questions}` sai do
conteúdo). Atualizar aqueles cards quando chegarmos neles.

### `main.tex`

```latex
\documentclass[11pt,a4paper,twocolumn]{exam}
\input{preambulo}      % pacotes, macros, defaults
\input{metadados}      % GERADO
\ifcadernorascunho
  \usepackage{draftwatermark}
  \SetWatermarkText{RASCUNHO}\SetWatermarkScale{1.2}\SetWatermarkColor[gray]{0.92}
\fi
\begin{document}
\twocolumn[\capaCaderno]
\begin{questions}
\input{conteudo}       % GERADO
\end{questions}
\end{document}
```

O rascunho é `\newif\ifcadernorascunho`, não `\def\cadernoRascunho{true}` como no design §5.2:
comparar string em LaTeX exige pacote e é frágil, booleano é nativo, e permite **carregar o
`draftwatermark` só quando é rascunho** — carregá-lo sempre estampa "DRAFT" por padrão.

### `preambulo.tex`

```latex
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[brazil]{babel}
\usepackage[a4paper,margin=2cm,columnsep=0.8cm]{geometry}
\usepackage{graphicx}
\usepackage[export]{adjustbox}       % max width=\linewidth
\usepackage{amsmath,amssymb}
\usepackage{enumitem}
\usepackage{tabularx,booktabs}
\usepackage[normalem]{ulem}
\usepackage{needspace}
\usepackage{xcolor}

\newif\ifcadernorascunho
\providecommand{\cadernoTitulo}{Caderno de Questões}
\providecommand{\cadernoSubtitulo}{}
\providecommand{\cadernoPendencias}{}

\renewcommand\choicelabel{(\Alph{choice})}
\qformat{\noindent\textbf{QUESTÃO \thequestion}\hfill}

\pagestyle{headandfoot}
\footer{}{\small\cadernoTitulo\ — \thepage}{}
```

As macros do caderno são declaradas **antes** do `\footer`, que usa `\cadernoTitulo`. O `\footer`
guarda o argumento pra expandir na hora de compor a página, então o valor que vale é o do
`metadados.tex` — mas declarar antes elimina a dúvida e faz o preâmbulo compilar isolado.

Três decisões com razão explícita:

- **`ulem` com `[normalem]`** — sem essa opção o `ulem` sequestra o `\emph` e sublinha todo itálico. O
  card 02 mapeia ênfase pra `\emph`; sem `normalem`, todo itálico do acervo sairia sublinhado no
  caderno. É o tipo de coisa que só aparece na revisão do PDF.
- **Sem `fancyhdr`** — a `exam.cls` tem cabeçalho/rodapé próprio (`\pagestyle{headandfoot}` +
  `\footer{}{}{}`). Misturar os dois é conflito conhecido; sem compilador local, prefere-se o mecanismo
  nativo da classe: um pacote a menos e um risco a menos.
- **Sem `multicol` no caminho principal** — as duas colunas vêm da opção `twocolumn` da classe. As
  alternativas ficam uma por linha (`choices` do `exam.cls`), que é o que cabe em ~8 cm.

Os `\providecommand` fazem o template compilar sozinho mesmo sem `metadados.tex`, o que torna o
`exemplo/` opcional e o template inspecionável isolado. O `\def` do arquivo gerado sobrepõe o default.

### `\capaCaderno`

```latex
\newcommand{\capaCaderno}{%
  \begin{center}
    \includegraphics[height=1.1cm]{logo.png}\\[0.4em]
    {\LARGE\bfseries\cadernoTitulo}\\[0.3em]
    {\large\cadernoSubtitulo}
  \end{center}
  \ifcadernorascunho
    \begin{center}\small\textbf{RASCUNHO} — pendências: \cadernoPendencias\end{center}
  \fi
  \vspace{0.3em}\hrule\vspace{0.4em}
  {\small Marque suas respostas no cartão-resposta.}
  \vspace{0.6em}\hrule\vspace{1em}
}
```

Identificação do aluno (nome, matrícula) fica de fora de propósito: é o cartão-resposta que carrega
isso, e é lá que o OMR lê. O bloco de instruções é a peça mais barata de ajustar depois.

## Validação: sem compilador local, um upload resolve dois caminhos

Não há distribuição TeX nesta máquina, e a decisão foi **não instalar** — a validação é manual, no
Overleaf. Isso torna cada ciclo caro, então o desenho minimiza ciclos.

O maior risco do card é que **`\documentclass[twocolumn]{exam}` não está testado**. A `exam.cls` deriva
da `article` e deve aceitar a opção, mas "deve" não é verificação.

Por isso o `exemplo/` sai com **dois** `main`, compilando o mesmo conteúdo:

- `main.tex` — `\documentclass[twocolumn]{exam}` + `\twocolumn[\capaCaderno]`
- `main-multicol.tex` — `exam` em uma coluna + `\begin{multicols}{2}` em volta do ambiente `questions`,
  capa como texto normal antes

São ~15 linhas de arquivo extra e transformam uma possível segunda rodada em zero. **O perdedor é
apagado antes do PR.** A expectativa é que o `twocolumn` da classe ganhe: o `multicol` tem interação
instável com o `needspace`, e é o `needspace` que impede o "QUESTÃO 46" órfão no pé da coluna.

### Smoke test (`exemplo/conteudo.tex`) — 6 questões sintéticas

O card pedia 4; duas colunas mudaram o perfil de risco e as duas últimas existem por causa disso.

1. Texto curto, com `\setcounter{question}{45}` — prova a numeração real
2. Fórmula inline e em display
3. Imagem larga no enunciado (a própria `logo.png`) — prova o `adjustbox` encolhendo
4. Alternativa que é imagem
5. **Tabela `tabularx` de 3 colunas** — a coluna tem ~8 cm; é o que mais tende a ficar ruim
6. **Enunciado longo o bastante pra atravessar a quebra de coluna** — prova o `needspace` e mostra
   como fica uma questão que continua na coluna seguinte

Todas com `\CorrectChoice` na correta, pra que o mesmo arquivo sirva de teste do gabarito.

Conteúdo **sintético**, escrito à mão. Não é amostra do acervo — é fixture de template.

## Critérios de aceitação

### Automatizáveis (sem TeX)

- [ ] Teste que resolve `path.join(__dirname, 'templates/padrao/v1')` — o mesmo caminho que o card 05
      vai usar — e lê os três arquivos que vão no zip
- [ ] `yarn build` e os três aparecem em `dist/modules/caderno/templates/padrao/v1/`
- [ ] `exemplo/` **não** aparece no `dist`

O segundo e o terceiro existem por causa do achado acima: no caminho original do card os arquivos nunca
chegariam ao container. Esse critério trava o bug.

### Conferência manual, um upload no Overleaf

- [ ] Compila sem erro
- [ ] Primeira questão sai como **46**
- [ ] Trocando pra `\documentclass[...,answers]{exam}`, o gabarito sai com a correta destacada
- [ ] Imagem larga não estoura a coluna
- [ ] Nenhum cabeçalho "QUESTÃO NN" órfão no fim de coluna
- [ ] Marca d'água aparece com `\cadernorascunhotrue` e some sem
- [ ] **Itálico sai itálico, não sublinhado** — o teste do `[normalem]`
- [ ] Rodapé com nome do simulado e página
- [ ] `LEIA-ME.txt` explica compilar, o que não editar e como tirar o gabarito

## Riscos

| Risco | Mitigação |
|---|---|
| `exam.cls` não aceitar `twocolumn` | O `main-multicol.tex`. Se os dois falharem, cai no plano B do card (`article` + `enumitem` + macros próprias) — e aí numeração explícita e gabarito voltam a ser trabalho nosso |
| Imagem encolhida a ~8 cm ficar ilegível | **Aceito por decisão** — diagramação é do usuário, que reedita a questão (design §4) |
| Tabela larga espremida na coluna | Idem. O item 5 do smoke test existe pra mostrar o quão ruim fica antes de a feature existir |
| `inputenc`/`fontenc` amarram a pdfLaTeX | Coerente com o card 08 (TeX Live + `pdflatex`). Se virar Tectonic/XeTeX, o preâmbulo troca por `fontspec` |
| `exclude` do `nest-cli` errado deixa o `exemplo/` vazar pro `dist` | Virou critério de aceitação automatizável |
| Escrever LaTeX sem poder compilar | Preâmbulo conservador, só pacotes mantidos e conhecidos; dois `main` no mesmo upload; nenhuma macro esperta além das quatro do caderno |

## Fora do escopo deste card

- Qualquer código que **leia** o template (é o card 05)
- A variante `ampliada` — só a estrutura de diretório a acomoda
- Validação de layout com conteúdo real: acontece no card 05, quando o primeiro caderno de um simulado
  de homologação for gerado. É lá que ajuste fino de tipografia aparece, e é barato porque layout mora
  em um arquivo só
