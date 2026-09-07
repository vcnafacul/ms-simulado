# Caderno LaTeX — Card 02: conversor markdown → LaTeX

**Data:** 2026-09-07
**Origem:** `vcnafacul-3/docs/prova-latex/cards/02-conversor-markdown-latex.md`
**Etapa:** Caderno LaTeX (`vcnafacul-3/docs/prova-latex/design.md`)
**Repos afetados:** `ms-simulado` (só este)
**Branch base:** `poc/caderno-latex` (card 01 já mergeado — PR #174)

## Contexto

O caderno é montado a partir do conteúdo já cadastrado das questões, que é **markdown com LaTeX
inline**, produzido pelo editor TipTap do `client-vcnafacul`. Este card entrega a função que traduz
esse markdown para LaTeX, encaixável no template do card 01.

É o componente de maior risco da etapa. A pesquisa (`estado-da-arte.md §2`) confirmou que **não
existe biblioteca npm mantida** que faça essa conversão cobrindo o nosso caso — as candidatas morrem
no HTML cru que o editor gera, e o Pandoc descarta HTML cru ao escrever LaTeX. O conversor é nosso,
sobre `unified`/`remark`, com o `rebber` como molde.

O subset a suportar **não é markdown genérico**: é exatamente o que o editor produz. É isso que torna
o card viável.

---

## Achados empíricos desta sessão

Quatro coisas foram verificadas rodando código, não lendo doc. Três contradizem o card.

### 1. A stack proposta é ESM-only, e o projeto é CommonJS puro

`unified@11`, `remark-parse@11`, `remark-gfm@4` e `remark-math@6` são todos `"type": "module"`. O
`ms-simulado` tem `module: commonjs` e nenhum `type` no `package.json`. O próprio card usa "ESM-only,
atrito com o CJS do Nest" como motivo pra descartar o `pandoc-wasm`, sem notar que a objeção vale pra
stack que ele escolheu.

**Funciona mesmo assim:** o Node 20.19 retroportou `require(esm)`. Medido — local 20.19.6, imagem
`node:20-alpine` traz **20.20.2**. O pipeline compilado como CJS parseia normalmente, `$x^2$` vira
`inlineMath` e tabela GFM vira `table`.

**Consequência boa:** um `import` estático basta, e o conversor **continua síncrono**. Isso preserva o
contrato de função pura do card 03, que teria virado assíncrono à toa.

**Consequência a proteger:** o piso de Node 20.19 é hoje satisfeito por uma tag Docker que flutua.
Pinar `node:20.11-alpine` quebraria o serviço no boot. Ver "Piso de Node".

### 2. O `R$` colide com math, e é comum — o card afirma o contrário

O card registra: *"a heurística do pacote já não casa `$` seguido de espaço, então `R$ 50` costuma
passar ileso"*. **Falso.** Medido:

| Entrada | `remark-math` produz |
|---|---|
| `custa R$ 50,00 e outro R$ 30,00` | `inlineMath(" 50,00 e outro R")` |
| `R$ 1.200 no mês` (um só) | nada — ok |
| `sobre R$ 80,00 resulta em $0{,}8 \times 80$` | `inlineMath("80,00 resulta em")` — engoliu a prosa **e** quebrou a fórmula legítima |

Dois `R$` no mesmo parágrafo e o texto entre eles vira matemática. Em prova brasileira isso é comum.
Desligar `singleDollarTextMath` não serve: o editor grava math inline como `$x^2$`, então desligar
mataria a feature principal.

### 3. `$$…$$` do editor nunca vira display

O `remark-math` só produz nó `math` (display) quando os delimitadores estão em linhas próprias. O
editor (`serializeInlineContent`) grava `$$formula$$` **numa linha só**, inline no parágrafo. Medido:
`$$\int_0^1 x\,dx$$`, sozinho no parágrafo ou no meio do texto, sai como `inlineMath` nos dois casos.

A distinção display/inline se perde antes de chegar no conversor. **É recuperável** pela fonte: o nó
carrega `position.start.offset`, e fatiar a string original mostra se o delimitador era `$` ou `$$`.
Medido e funcionando.

### 4. A heurística óbvia do `R$` destrói `$R$`

`$R$` é fórmula legítima e comuníssima — R de raio, de resistência. A regra ingênua
(`/R\$(?=[\s\d])/g`) transforma `O raio $R$ e o dobro` em `O raio $ e o dobro`, e o `$` órfão quebra a
matemática do resto do parágrafo. Achado ao escrever este desenho.

Conserto: ancorar também à esquerda, para não casar quando o `R` já está dentro de math.

```
/(^|[^$])R\$(?=[\s\d])/g
```

Medido nos quatro casos, incluindo o misto: `A resistência $R$ custa R$ 12,00` preserva a fórmula e
neutraliza o dinheiro.

---

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Parser | `unified@11` + `remark-parse@11` + `remark-gfm@4` + `remark-math@6`, ESM via `require(esm)` | Nada mantido faz markdown→LaTeX; mdast é o modelo certo pro subset fechado do editor. Ver estado-da-arte §2. |
| API | **Síncrona** | `require(esm)` funciona no Node ≥20.19, então não há motivo pra contaminar o card 03 com async. |
| Arquitetura | Camada de **pré-transformação** + compiler de handlers | Os três reparos têm origens e prazos de validade diferentes; separados, cada um morre sozinho quando a causa sumir. |
| `singleDollarTextMath` | Fica no default `true` | Desligar mataria a math inline do editor, que é a feature. O `R$` se resolve antes do parser. |
| `R$` | Neutralizado **antes** do parser, ancorado nos dois lados | O estrago acontece na tokenização; depois de virar nó a informação já se perdeu. |
| Display math | Restaurado pelo `position.start.offset` na fonte | Única forma — o mdast sozinho não distingue. |
| Matemática | Passa sem escape, mas **validada pelo próprio KaTeX** | Na fase 1 quem compila é o usuário, sem as proteções que o card 08 planeja. Lista de bloqueio foi tentada e derrotada — ver "Sanitização". |
| Falha de conversão | Nunca lança: fallback textual + aviso | Um markdown exótico não pode derrubar um caderno de 90 questões. |
| `avisos` | Sem contexto de questão | Quem sabe o número é o card 03, que prefixa. Mantém o conversor puro. |

---

## Arquitetura

```
src/modules/caderno/markdown/
├── markdown-to-latex.ts        entrada pública: orquestra o pipeline
├── escape-latex.ts             escaper (exportado à parte — card 03 usa)
├── sanitizar-math.ts           comandos barrados dentro de fórmula
├── pre-transform/
│   ├── neutralizar-real.ts     R$ → marcador, ANTES do parser (string → string)
│   ├── restaurar-display.ts    marca os inlineMath que eram $$, via offset
│   └── agrupar-html.ts         casa <div>…</div> fatiado em nós irmãos
├── handlers.ts                 um handler por tipo de nó (~22, pequenos)
└── fixtures/                   input.md + expected.tex
```

### Pipeline

```
markdown
  → neutralizarReal(md)               string → string
  → unified().parse()                 string → mdast (com position)
  → restaurarDisplay(tree, mdNeutro)  marca os inlineMath que eram $$
  → agruparHtml(tree)                 envolve os irmãos entre <div> e </div>
  → compilar(tree, opts)              mdast → { latex, assets, avisos }
```

⚠️ **`restaurarDisplay` fatia a string neutralizada, não a original.** Os offsets do mdast são
relativos ao que foi parseado. Reordenar o pipeline quebra isso em silêncio — é o erro mais fácil de
introduzir depois.

### Contrato público

```ts
export interface ConversaoResultado {
  latex: string;
  assets: string[];   // keys asset:// na ordem de aparição
  avisos: string[];   // o que a pessoa precisa conferir na questão
}

export function markdownToLatex(
  markdown: string,
  opts: { resolveAsset: (key: string) => string },  // key → 'assets/07.png'
): ConversaoResultado;
```

### Mapeamento

| Origem | Markdown | LaTeX |
|---|---|---|
| Parágrafo | texto | texto escapado |
| Negrito / itálico / tachado / code | `**x**` `*x*` `~~x~~` `` `x` `` | `\textbf{}` `\emph{}` `\sout{}` `\texttt{}` |
| Heading | `#`..`######` | `\textbf{...}\par` |
| Lista / ordenada | `- x` / `1. x` | `itemize` / `enumerate` (`enumitem`, compacto) |
| Citação | `> x` | `quote` |
| Bloco de código | ``` ``` ``` | `verbatim` |
| Tabela GFM | `\| a \| b \|` | `tabularx` + `booktabs`, respeitando o `align` do nó |
| Fórmula inline | `$x$` | `$x$` |
| Fórmula display | `$$x$$` | `\[x\]` — display restaurado pelo offset |

⚠️ **"Passa sem tocar" vale para o conteúdo, não para o delimitador.** O nó do `remark-math` entrega o
LaTeX cru em `.value`, **sem** os delimitadores — então o handler tem que reemiti-los de qualquer
forma. O conteúdo nunca é alterado nem escapado; o delimitador é normalizado: `$…$` para inline e
`\[…\]` para display.

`\[…\]` em vez de reemitir `$$…$$`: os dois renderizam display, mas `$$` é sintaxe primitiva do TeX
que passa por fora do tratamento do `amsmath`, incluindo `\predisplaypenalty`/`\postdisplaypenalty` —
justamente os controles de quebra que importam para uma fórmula em display numa coluna de ~8 cm, que
é o layout do card 01.
| Imagem markdown | `![alt](asset://KEY)` | `\includegraphics[max width=\linewidth]{assets/NN.png}` |
| Imagem HTML | `<img src="asset://KEY" width="320">` | idem, com largura |
| Alinhamento | `<div style="text-align: center">…</div>` | `center` / `flushright` |

### Escaper

Fora de math, escapa `\ { } $ & % # _ ~ ^ < > |`. Os quatro últimos são os que o `escape-latex` não
cobre e que fazem `a < b` sair como `a ¡ b` em fonte T1 — por isso o escaper é nosso, não a dependência.
`\` primeiro, senão as substituições seguintes se comem.

Exportado à parte porque o card 03 precisa dele para o `\def\cadernoTitulo`.

### Sanitização da matemática

Dentro de math nada é escapado — o editor grava LaTeX de verdade. Mas o canal é aberto: quem cadastra
questão pode escrever `$\input{/etc/passwd}$`, o KaTeX mostra erro no editor e salva mesmo assim, e o
`.tex` gerado carrega o comando intacto. **Na fase 1 quem compila é o usuário**, na máquina dele ou no
Overleaf — as proteções que o card 08 planeja (`openin_any=p`, `-no-shell-escape`) não existem lá.

### A lista de bloqueio não sustentou — o que ficou no lugar

A primeira versão desta seção especificava uma lista de oito comandos barrados. **Ela foi derrotada
estruturalmente**, e vale registrar como, porque o motivo elimina a abordagem inteira e não só aquela
lista:

| Ataque | Por que a lista não alcança |
|---|---|
| `^^5cinput{/etc/passwd}` | **Não contém barra invertida nenhuma.** O `^^5c` vira `\` antes da tokenização do TeX, então nada ancorado em `\\` pode ver |
| `\pdffiledump{0}{4096}{/etc/passwd}` | Primitiva do pdfTeX, sem pacote, lê arquivo e não contém radical algum |
| `\tex_input:D`, `\sys_shell_now:n` | expl3, no formato do LaTeX desde 2020. O `_` cai fora de qualquer classe de caractere de nome |
| `\InputIfFileExists`, `filecontents` | Kernel do LaTeX2e, sempre disponíveis |

O lexer do TeX sabe soletrar `\input` sem as letras de `input`. Nenhuma lista de bloqueio sobrevive a
isso.

**O que ficou: validar com o próprio KaTeX** (`katex.__parse`). Ele aceita só o que entende, e não
entende I/O de arquivo. Medido: rejeita os onze ataques acima e aceita as fórmulas legítimas de prova.

O que torna isso barato é que **o editor renderiza com o mesmo KaTeX puro** (verificado em
`LatexExtension.ts` e `RichTextRenderer.tsx`: sem mhchem, sem siunitx, sem `trust`). Uma fórmula que
esta função rejeita **já aparecia quebrada para quem cadastrou a questão** — então o falso positivo é
zero por construção, coisa que nenhuma lista de bloqueio consegue prometer.

Sobra uma lista de exceção pequena, para o que o KaTeX aceita mas é perigoso em LaTeX de verdade:
`\includegraphics` (embute qualquer arquivo do disco de quem compila), `\href` e `\url`. Os três
foram encontrados medindo o gate `isTrusted()` do KaTeX, não adivinhando.

Fórmula barrada vira **texto escapado visível** mais um aviso — quem for imprimir vê que há algo
errado ali, em vez de o comando sumir em silêncio.

### Degradação e avisos

Nunca lança. `markdownToLatex('')` devolve string vazia. Três situações geram aviso e seguem:

- nó não suportado → `textContent` escapado
- fórmula barrada pelo `sanitizar-math` → texto escapado
- `asset://` que o `resolveAsset` não conhece → marcador visível `[imagem indisponível]` no lugar

Os avisos sobem até o `manifest.json` do zip (card 05). São o canal que devolve a responsabilidade a
quem cadastrou a questão, então cada um diz **o que fazer**, em português legível por quem não é dev.

---

## Testes

**Fixtures** (`input.md` + `expected.tex`), uma por linha do mapeamento e uma por armadilha — ~18.
Escritas à mão, mas imitando o que os **dois** serializers do editor produzem (`tiptap-markdown` e o
`serializeDocToMarkdown` manual), com o caminho de origem anotado em cada uma. São formatos diferentes
e o acervo tem conteúdo dos dois.

Fixtures obrigatórias que saíram deste desenho e não estavam no card:

- `$R$` no mesmo parágrafo que `R$ 12,00`
- `$$fórmula$$` inline saindo como display
- fórmula com `\input` sendo barrada

**Testes unitários por pré-transformação**, isolados. São a parte que mais vai iterar, e é a vantagem
de terem virado três arquivos.

Cobertura ≥ 90% no módulo.

### O critério que não dá pra automatizar

O card pede que cada `expected.tex` compile dentro do template do card 01. **Não há TeX na máquina de
desenvolvimento** — mesma restrição do card 01, mesma decisão consciente. Vira o segundo round-trip
manual da etapa.

Como o card 01 ensinou que a rodada manual é o recurso caro, o caderno de fixtures já nasce desenhado
para responder o máximo numa passada: cada fixture vira uma questão numerada com o nome dela visível
acima, para que o usuário saiba qual quebrou sem caçar.

## Piso de Node

Entra `engines: { "node": ">=20.19" }` no `package.json` e uma nota no `ms.dockerfile` explicando por
quê. A própria suíte é a rede de segurança: num Node anterior ela falha no import, alto e imediato.

## Riscos

| Risco | Mitigação |
|---|---|
| Heurística do `R$` com falso positivo não previsto | Ancorada nos dois lados, coberta por fixture. Falso positivo vira fórmula literal visível, não conteúdo sumido |
| Reordenar o pipeline desalinha o offset do `restaurarDisplay` | Comentário no ponto exato e teste que passa explicitamente a string neutralizada |
| Fixture escrita "como a gente escreveria" e não como o editor grava | Fixtures derivadas dos dois serializers, com a origem anotada |
| `sanitizar-math` barrando fórmula legítima | Falso positivo é zero por construção: o editor usa o mesmo KaTeX, então o que é rejeitado aqui já estava quebrado lá. Barrado sai visível com aviso, nunca some |
| Node pinado abaixo de 20.19 quebra o boot | `engines` + nota no Dockerfile; a suíte falha alto |

## Fora do escopo

- Corrigir o serializer do `client-vcnafacul` — virou o ticket `017` (editor perde tabela quando há
  conteúdo abaixo dela). O conversor trata o que estiver no banco; o card 02 não espera por ele.
- Compilar LaTeX em CI ou em teste automatizado.
- Suporte a markdown fora do subset do editor.

## Reflexos nos próximos cards

| Card | O que muda |
|---|---|
| 03 | Recebe `markdownToLatex` **síncrona**; prefixa os `avisos` com o número da questão; usa o `escapeLatex` exportado para o `\def\cadernoTitulo` |
| 05 | Os `avisos` acumulados dos cards 02/03/04 vão pro `manifest.json` |
| 08 | A validação por KaTeX é defesa em profundidade, **não** substitui `openin_any=p` e `-no-shell-escape`. E ela cobre só a **matemática**: texto fora de math não passa por lá |
| 01 | A fixture `exemplo/conteudo.tex` usa `$$…$$` na questão 47. Ela existe para imitar o que o gerador emite, e o gerador passa a emitir `\[…\]` — vale alinhar quando alguém mexer nela. Não é urgente: é fixture sintética, não código que roda. |
