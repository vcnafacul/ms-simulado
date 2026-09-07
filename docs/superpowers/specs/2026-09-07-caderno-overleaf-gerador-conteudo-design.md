# Card 02 · Gerador do `conteudo.tex` e `metadados.tex`

**POC:** Caderno · Overleaf · **Branch:** `feature/caderno-02-gerador-conteudo` (de `poc/caderno-overleaf`)
**Card:** `docs/prova-latex-overleaf/cards/02-gerador-conteudo-tex.md` · **Depende de:** card 01 (mergeado, PR #177)

---

## O que é

Uma função pura. Recebe um simulado já populado e devolve os dois arquivos gerados mais a lista de
imagens a materializar. **Sem I/O**: não busca no Mongo, não lê o R2, não baixa URL, não escreve
arquivo. É o que a torna testável sem infraestrutura, e é também o que a impede de fazer requisição de
saída a partir de texto que veio de uma questão.

```ts
export function gerarCaderno(
  simulado: SimuladoParaCaderno,
  opts: { draft: boolean },
): CadernoGerado;
```

## A premissa, de novo

Não existe conversor de markdown nesta POC. O texto da questão entra no molde `.tex`
**literalmente**, com um `\question` na frente. `**negrito**` sai com os asteriscos; tabela sai como
sopa de pipes. Isso é decisão, não lacuna, e o critério é o do usuário: *defeito visível alguém
conserta; texto que sumiu, não.*

Três coisas escapam dessa regra, e cada uma tem um motivo que não é estético:

| Exceção | Por quê |
|---|---|
| Escape LaTeX (card 01) | `%` é comentário: "100% dos casos" imprime `100` e **apaga o resto da linha**, sem erro |
| Imagem vira `\includegraphics` | literal, uma imagem é só a URL impressa — a figura **não existiria** na prova |
| `<div style="text-align:…">` some | sem isso, lixo de HTML impresso em volta de toda imagem alinhada |

Tudo o mais entra como está.

---

## Arquitetura

```
src/modules/caderno/gerador/
├── tipos.ts               SimuladoParaCaderno, CadernoGerado, ImagemRef
├── imagens.ts             construtos → \includegraphics; extensão, dedup, numeração
├── texto-para-latex.ts    um campo de texto → LaTeX
└── gerar-caderno.ts       seleção, ordem, blocos, metadados, avisos
```

### Tipos

```ts
export type ImagemRef =
  | { origem: 'r2'; key: string; arquivo: string }
  | { origem: 'url'; url: string; arquivo: string };

export interface CadernoGerado {
  conteudo: string;
  metadados: string;
  imagens: ImagemRef[];
  avisos: string[];
  questoesIncluidas: number[];
  questoesFaltantes: number[];
}
```

`SimuladoParaCaderno` é interface mínima local, no espírito do `SimuladoBloqueavel` em
`simulado/helpers/bloqueado.ts`. Não acopla ao schema Mongoose:

```ts
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

export interface SimuladoParaCaderno {
  nome: string;
  categoria: {
    nome: string;
    duracao: number;
    quantidadeTotalQuestao?: number | null;
  };
  questoes: { questao: QuestaoParaCaderno; numero: number | null }[];
}
```

⚠️ **`alternativa` não está na interface, e é de propósito.** Ver "O gabarito não viaja", abaixo.

⚠️ `imageId` e `imageAlternativaA..E` também ficam de fora. Decisão do usuário na POC 1: para a prova
gerada, só entram enunciado, pergunta e alternativas em texto — imagem só a que estiver dentro do
texto.

---

## O gabarito não viaja no zip

**Todas as cinco alternativas saem como `\choice`. Nunca `\CorrectChoice`.**

O motivo não é de layout. `\CorrectChoice` renderiza **idêntico** a `\choice` quando a
`\documentclass` não tem a opção `answers` — então o gabarito não apareceria no PDF, mas estaria
escrito em texto claro dentro do `conteudo.tex`, que a pessoa sobe num projeto do Overleaf, e projeto
de Overleaf se compartilha por link. O vazamento seria invisível justamente porque o PDF fica igual.

A aplicação é a fonte da verdade do gabarito.

Isso é garantido por construção, não por disciplina: **`alternativa` não entra em
`SimuladoParaCaderno`**, então o gerador não tem o dado nem por acidente. De quebra, some a
necessidade de o card 04 pedir o campo explicitamente (ele tem `select: false` no schema).

### Dívida no card 00 que este card paga

Dois arquivos que **vão dentro do zip** prometem a feature que não vai existir:

- `templates/v1/main.tex`, no comentário do topo: *"Gabarito do professor: troque a linha do
  `\documentclass`… A alternativa correta sai destacada."*
- `templates/v1/LEIA-ME.txt`, a seção inteira **"GABARITO DO PROFESSOR"**.

Quem seguir essas instruções recompila e não vê diferença nenhuma — lê como template quebrado, e vai
procurar defeito onde não tem. Os dois trechos saem neste card.

`templates/v1/exemplo/conteudo.tex` **mantém** o `\CorrectChoice`: é smoke test do template, já diz no
cabeçalho que não é modelo da saída do gerador, e prova que o `exam.cls` faz aquilo. Ganha uma linha
no cabeçalho registrando que o gerador emite só `\choice`, por decisão.

---

## O pipeline de um campo de texto

É o card 01 um nível acima:

```
texto cru
  → remove <div style="text-align:…"> e o </div> correspondente
  → segmenta nos construtos de imagem
        segmento de imagem  →  \includegraphics[…]{assets/NN.ext}   (não escapa)
        segmento de texto   →  escaparForaDaMatematica(…)           (card 01)
  → junta
```

⚠️ **A ordem não é arbitrária.** Escapar primeiro destrói `<img src="…">`: `<`, `>` e `"` estão todos
no mapa do `escapeLatex`. Substituir primeiro insere `\includegraphics{…}`, cujos `\ { }` o escaper
destruiria em seguida. É o mesmo problema que o card 01 resolveu para matemática, e por isso a mesma
forma: segmentar, e delegar o resto.

O `escaparForaDaMatematica` continua cuidando das fórmulas dentro de cada segmento de texto, sem saber
que imagens existem.

### Parágrafos

Não precisam de tratamento. Linha em branco no markdown já é quebra de parágrafo em LaTeX, e `\n`
simples já é espaço. O texto atravessa.

---

## Imagens

### Os construtos que o editor grava

O caso dominante do acervo — quase 100% — é **URL externa**, com alt vazio:

```
![](https://enem.dev/2016/questions/3/812288c1-3e37-4369-914a-057525abd52e.png)
```

Os demais, do editor rico (`useRichTextEditor.ts:143-165`):

| Construto | Quando |
|---|---|
| `![alt](URL_ou_asset://KEY)` | sem width e sem alinhamento |
| `<img src="…" alt="…" width="320" height="200" />` | com dimensão |
| `<div style="text-align:…">` … `</div>` | com alinhamento — as tags somem antes da segmentação |

`asset://assets/<uuid>.<ext>` é key no R2: bucket `BUCKET_QUESTION`, e o `assets/` é o **prefixo real
da key**, não enfeite (`api-vcnafacul/.../questao.service.ts:104-111` + `s3-service.ts:45-47`).

O `alt` é descartado — `\includegraphics` não tem legenda, e no acervo real ele vem vazio.

### O que é emitido

```latex
\includegraphics[max width=\linewidth]{assets/01.png}
\includegraphics[width=240pt,max width=\linewidth]{assets/02.jpeg}
```

**Sempre como parágrafo próprio**, com linha em branco antes e depois, colapsando espaço em branco
adjacente para não gerar parágrafo duplo.

⚠️ No acervo a imagem aparece **colada** no texto (`![](…png)Os moradores de Andalsnes…`). Deixada
inline, o LaTeX mete a figura dentro da linha e a linha vira da altura dela numa coluna de 8 cm.
Figura de prova é bloco; é o que o fixture do card 00 faz.

Largura: px → pt a **0,75** (CSS define 1px = 1/96 in; 1pt = 1/72 in). Sempre com `max width=\linewidth`
**depois**, para que uma conversão errada encolha em vez de estourar a coluna. Sem `width` no
construto, só o teto.

⚠️ O `max width` é do `adjustbox`, carregado `[export]` no `preambulo.tex`. Ele encolhe, nunca amplia.

### Nomeação e dedup

`assets/NN.<ext>`, `NN` sequencial de dois dígitos por ordem de aparição, **contador único no caderno
inteiro** (não por questão). Dedup por identidade da origem — mesma key, ou mesma URL, em duas
questões vira **um** arquivo e uma entrada em `imagens[]`.

### A superfície de injeção é só a extensão

Como tudo é renomeado, **nem a key nem a URL chegam ao `.tex`**. `assets/` e `NN` são gerados por nós.
O único byte que vem do usuário é a extensão — e ela não é sanitizada rio acima:
`s3-service.ts:43` monta com `originalname.split('.').pop()?.toLowerCase()`, sem filtro. Um arquivo
chamado `mapa.p}ng` produz key terminada em `}`, que **fecha o grupo do `\includegraphics` cedo** e
derrama o resto como LaTeX solto.

Regra: a extensão precisa casar `^[A-Za-z0-9]{1,5}$`.

Para URL, a extensão sai do path **depois de descartar `?query` e `#fragmento`**.

### Esquemas aceitos

Só `http:`, `https:` e `asset:`. Qualquer outro é recusado.

⚠️ Isto não é higiene abstrata: o card 03 vai fazer **requisição de saída** para uma URL que veio do
texto de uma questão. `![](http://169.254.169.254/latest/meta-data/)` é o desenho clássico de SSRF. O
gerador é quem decide o que entra em `imagens[]`, então é o lugar certo para fechar a lista — o card
03 herda já filtrada, e a defesa em profundidade dele é outra conversa.

### Quando a imagem é recusada

Sai `\textbf{[imagem indisponível]}` no lugar, mais um aviso dizendo a questão e o motivo. Nunca
silêncio, nunca exceção.

---

## O bloco de cada questão

```latex
\needspace{10\baselineskip}
\setcounter{question}{<numero - 1>}
\question <textoQuestao>

<pergunta>
\begin{choices}
  \choice <A>
  \choice <B>
  \choice <C>
  \choice <D>
  \choice <E>
\end{choices}
```

⚠️ `\setcounter{question}{<numero - 1>}` — o `exam.cls` incrementa **antes** de imprimir. Para sair
"QUESTÃO 48", o contador vai a 47.

⚠️ **Um `\setcounter` por questão**, não só na primeira. Assim um buraco de numeração no modo rascunho
não desalinha todas as seguintes.

⚠️ **Nunca renumerar.** Imprime o `numero` do relacionamento: os blocos 46..90 do ENEM precisam casar
com o cartão-resposta.

O `conteudo.tex` **não** abre nem fecha o ambiente `questions` — quem faz isso é o `main.tex`.

---

## Simulado sem questão elegível gera zip que não compila

`questions` no `exam.cls` é ambiente de lista. `\begin{questions}\end{questions}` sem nenhum
`\question` dentro dispara *"Something's wrong--perhaps a missing \item"* e a compilação **para**.

É alcançável: no modo rascunho o filtro pode zerar. E nesta POC é o pior desfecho possível — pior que
prova feia, porque a pessoa não recebe nada que dê para consertar.

Zero questões emite **uma questão-marcador visível**:

```latex
\setcounter{question}{0}
\question \textbf{[Este simulado não tem nenhuma questão elegível para o caderno.]}
```

mais o aviso correspondente. O zip sempre compila.

---

## Seleção e ordem

- **Modo normal:** todas as `simulado.questoes`, ordenadas por `numero` ascendente. O gerador
  **reordena**, em vez de confiar que já vêm ordenadas.
- **Modo rascunho:** filtra `questao.status === Approved && numero != null`, ordena, e preenche
  `questoesFaltantes` com os números ausentes até `categoria.quantidadeTotalQuestao` — só quando não
  for `null`, porque categoria custom tem quantidade livre (ver `atingiuQuantidade` em
  `simulado/helpers/bloqueado.ts`).

`questoesIncluidas` são os números efetivamente impressos.

O gerador **não** sabe se o simulado pode ser gerado — o gate `bloqueado` é do card 04.

---

## `metadados.tex`

```latex
% gerado automaticamente por ms-simulado — não editar
\def\cadernoTitulo{Simulado 100\% ENEM}
\def\cadernoSubtitulo{ENEM 1º dia $\cdot$ 90 questões $\cdot$ 300 min}
\cadernoRascunhotrue
\def\cadernoPendencias{12, 15, 30}
```

⚠️ `\cadernoRascunho` é um **`\newif`** declarado no `preambulo.tex`, não um `\def`. Emitir
`\def\cadernoRascunho{true}` não liga a marca d'água e **não dá erro** — ela simplesmente não aparece.
No modo normal a linha é omitida por completo, junto com `\cadernoPendencias`.

⚠️ Nome do simulado e nome da categoria passam pelo escape. "Simulado 100% ENEM" sem escape apaga o
resto da linha.

⚠️ Separador do subtítulo é `$\cdot$`, como no fixture do card 00 — o `·` literal depende de o T1 ter
o glifo.

⚠️ São dois arquivos porque o `metadados.tex` é lido **no preâmbulo**, antes do `\begin{document}`, e o
`conteudo.tex` dentro do documento. A capa precisa do título antes de as questões serem diagramadas.

---

## Avisos

Bloco de comentário no topo do `conteudo.tex`, uma linha por aviso:

```latex
% AVISO: questão 47 — alternativa C está em branco
% AVISO: questão 52 — imagem recusada: extensão inválida
```

⚠️ **Quebra de linha dentro do texto de um aviso encerra o comentário** e joga o resto no documento.
Todo aviso passa por achatamento de `\n` (e `\r`) para espaço antes de virar linha.

Não existe `manifest.json` nesta POC — zero arquivo novo, e o aviso fica onde a pessoa já vai olhar ao
abrir o projeto. Comentário LaTeX não afeta a compilação nem aparece no PDF, e o `LEIA-ME.txt` manda o
coordenador procurar exatamente essas linhas.

Cada aviso diz **qual questão** e **o quê**, em português legível por quem não é dev.

---

## Degradação

Nada lança. Um caderno com uma questão degradada é recuperável; um caderno que não gera, não.

| Situação | O que sai | Aviso |
|---|---|---|
| Alternativa vazia | `\choice{}` | sim |
| Todos os campos vazios | bloco com `\question` vazio | sim |
| Imagem com extensão inválida | `\textbf{[imagem indisponível]}` | sim |
| Imagem com esquema não aceito | `\textbf{[imagem indisponível]}` | sim |
| Nenhuma questão elegível | questão-marcador | sim |
| Campo com markdown (`**x**`, tabela) | o markdown literal, escapado | **não** — é o esperado |

---

## Testes

Função pura: roda sem Mongo, sem R2, sem Nest — só `import`.

**Seleção e numeração**
- 5 questões geram 5 blocos, na ordem dos números
- numeração preserva o `numero` do relacionamento — testar com bloco **46..50**, não 1..5
- entrada fora de ordem sai ordenada
- buraco de numeração no rascunho (46, 47, 51) sai correto, com `\setcounter` por questão
- rascunho: `Pending` fica de fora; aprovada sem `numero` fica de fora; `questoesFaltantes` bate
- rascunho com `quantidadeTotalQuestao: null` devolve `questoesFaltantes: []`
- nenhuma questão elegível → questão-marcador + aviso, e o `.tex` **não** fica vazio

**Imagens**
- `![](https://enem.dev/….png)` vira `\includegraphics` e entra como `{ origem: 'url' }`
- `![](asset://assets/<uuid>.jpeg)` entra como `{ origem: 'r2' }` com a key **inteira**, prefixo incluso
- `<img src="…" width="320" height="200" />` emite `width=240pt` (0,75 × 320)
- `<div style="text-align:center">` some, e o conteúdo permanece
- `<div style="text-align:right">Fonte: IBGE</div>` sem imagem → sobra `Fonte: IBGE`
- imagem **colada** no texto (`![](…)Os moradores…`) sai como parágrafo próprio
- mesma key em duas questões: **uma** entrada em `imagens[]`, mesmo `arquivo`
- mesma URL em duas questões: idem
- numeração é contínua no caderno, não reinicia por questão
- extensão com `}` → recusada, com marcador visível e aviso
- URL com `?query` e `#frag` → extensão correta
- `![](ftp://x/y.png)` → recusada com aviso
- `![](javascript:alert(1))` → recusada com aviso

**Escape e matemática**
- `\def\cadernoTitulo` escapa: `Simulado 100% ENEM`
- `$x^2$` no enunciado atravessa intacto (o card 01 continua valendo dentro do pipeline)
- `100% dos casos` no enunciado sai `100\% dos casos`
- `**negrito**` sai com os asteriscos — a premissa da POC, afirmada como teste

**Gabarito**
- nenhuma saída contém a string `\CorrectChoice`, em nenhum modo
- `SimuladoParaCaderno` não tem campo `alternativa` (garantia de tipo, não de disciplina)

**Avisos**
- aviso com `\n` no texto vira uma linha só
- alternativa vazia gera aviso sem quebrar

**Fechamento**
- snapshot do `conteudo.tex` de um simulado fixture completo
- o `conteudo.tex` gerado **não** contém `\begin{questions}` nem `\end{questions}`

## Critérios de aceitação

- [ ] Todos os testes acima
- [ ] Cobertura ≥ 90% em `gerador/`
- [ ] `main.tex` e `LEIA-ME.txt` sem a promessa do gabarito
- [ ] `exemplo/conteudo.tex` com a nota de que o gerador emite só `\choice`
- [ ] `yarn build` gera `dist/main.js` na raiz

## Gate

Este card **tem** gate no Overleaf, diferente do card 01: é o primeiro `conteudo.tex` de verdade. Um
fixture gerado pelos testes é montado com os arquivos do template e compilado à mão pelo usuário.

O que olhar: numeração real (46..50, não 1..5), imagem como bloco e dentro da coluna, `100%` impresso,
fórmula renderizada, marca d'água só no rascunho, e o bloco `% AVISO:` no topo.

## Risco

**Baixo-médio.** A lógica é preencher molde, e o pedaço difícil — decidir onde escapar — já está
pronto e testado no card 01. O que sobra é dado inconsistente do acervo, e tudo vira aviso.

O ponto de atenção real é a segmentação de imagem: é a segunda vez nesta etapa que uma região precisa
atravessar sem escape, e a primeira vez custou quatro condições e duas rodadas de review.
