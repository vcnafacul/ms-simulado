# Caderno · Overleaf — Card 01: escape LaTeX com matemática intacta

**Data:** 2026-09-07
**Origem:** `vcnafacul-3/docs/prova-latex-overleaf/cards/01-escape-latex.md`
**Etapa:** Caderno · Overleaf (`vcnafacul-3/docs/prova-latex-overleaf/README.md`)
**Repos afetados:** `ms-simulado` (só este)
**Branch base:** `poc/caderno-overleaf` (card 00 mergeado — PR #176)

## Contexto

Esta POC gera um caderno de prova imprimível **sem converter markdown**. O texto da questão entra no
molde LaTeX **literalmente**, com um `\question` ou `\choice` na frente. `**negrito**` sai com os
asteriscos; tabela sai como sopa de pipes. Isso é decisão, não lacuna: defeito visível quem imprime
conserta.

**Uma coisa não pode entrar literal.** Em LaTeX, `%` é comentário: uma questão com "100% dos casos"
imprime `100` e o resto da linha **desaparece** — sem erro, sem aviso, sem aparecer como problema no
Overleaf. Quem for imprimir não tem como perceber que sumiu.

É o critério que separa o que fica do que vai embora nesta POC: **defeito visível alguém conserta;
texto que sumiu, não.** Por isso o escape é a única peça com esperteza que sobrou, e é este card.

## O que este card NÃO faz

- Não converte markdown, não caminha árvore, não tem handler por tipo de nó
- Não valida fórmula contra injeção — decisão registrada no README da POC, com os gatilhos que mandam
  reabrir
- Não normaliza delimitador de matemática. Diferente da POC anterior, onde o parser removia os `$` e o
  handler tinha que reemitir (daí a discussão de `\[...\]`), aqui o texto atravessa como está e o
  LaTeX renderiza display sozinho

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Estrutura | **Duas funções** em arquivos separados | A tabela de escape é estável; o fatiamento é heurística que vai ser ajustada. Junto, cada ajuste de heurística mexe no arquivo que contém a tabela |
| `escape-latex.ts` | **Cópia** da branch do card 02 da POC anterior | 30 linhas já revisadas, incluindo a aspa dupla ativa do `babel[brazil]`. Não reescrever |
| Nomes | `escapeLatex` e `escaparForaDaMatematica` | `escapeLatex`/`escaparParaLatex` se confundem na chamada. Quem lê precisa saber qual escapa e qual decide **onde** |
| Delimitadores | **Não são tocados** | O trecho de fórmula atravessa inteiro, com os `$`. Menos código e mais fiel ao que o autor escreveu |
| `%` dentro de math | Escapado, **exceto** se já precedido de `\` | É comentário em qualquer modo. Mas `$50\%$` é fórmula plausível, e escapar cegamente faria `\%` virar `\\%` — quebra de linha seguida de comentário |
| Gate no Overleaf | **Não tem** | A tabela de escape já passou por compilação real na POC anterior. O que é novo aqui é verificável inspecionando a string |

## Arquitetura

```
src/modules/caderno/latex/
├── escape-latex.ts                    escapa tudo, não sabe de matemática
├── escape-latex.spec.ts
├── escapar-fora-da-matematica.ts      fatia as regiões, chama o escaper fora
└── escapar-fora-da-matematica.spec.ts
```

### Contrato

```ts
export function escapeLatex(texto: string): string;
export function escaparForaDaMatematica(texto: string): string;
```

Sem opções, sem avisos, sem estado. String entra, string sai. O card 02 chama a segunda em cada campo
de texto da questão.

### O escaper

Fora da matemática, treze caracteres: `\ { } $ & # _ % ~ ^ < > | "`.

⚠️ **Passada única.** Escapar em várias passadas quebra: a barra vira `\textbackslash{}` e a passada
seguinte escapa as chaves que ela mesma inseriu, produzindo `\textbackslash\{\}`. Um `replace` com
classe de caractere e mapa de lookup, nunca um `reduce` sobre pares.

⚠️ **A aspa dupla é a menos óbvia.** O `babel[brazil]` que o `preambulo.tex` carrega torna `"` ativo e
declara os atalhos `"< "> "- "" "|`. Sem escapar, `""` vira salto de largura zero e **as aspas somem da
prova**; `"-` vira hífen discricionário.

### O scanner

Uma passada da esquerda para a direita. Em cada `$`, decide se abre fórmula:

```
abre  ⟺  não precedido de R/r
      ∧  não seguido de espaço
      ∧  existe delimitador de fechamento adiante
      ∧  (se inline) a região não contém quebra de linha
```

`$$` é testado antes de `$`, e fecha com `$$`. Se abre, o trecho **incluindo os delimitadores**
atravessa sem escape, com a exceção do `%`. Se não abre, o `$` é texto e vira `\$`.

| Entrada | Resultado | Qual condição decide |
|---|---|---|
| `$x^2$` | abre | o que o editor grava |
| `$R$` | abre | a âncora olha o caractere **antes** do cifrão; aqui é espaço |
| `R$ 12,00` | não abre → `R\$ 12,00` | âncora do `R` |
| `R$5` | não abre | âncora do `R` — a regra do espaço não pegaria |
| `custa $ 50 e $ 30` | nenhum abre | regra do espaço |
| `custa $ 50` sozinho | não abre | falta fechamento |
| `$$\int_0^1 x\,dx$$` | abre como `$$`, sai intacto | — |
| `a) $5`⏎`b) $10`⏎`c) $x$` | só o `$x$` abre | a quarta condição |

A condição do fechamento é o que impede o pior caso: um `$` solto abrindo região que nunca fecha e
engolindo o escape do resto do texto. Ela também é o que **faz o laço terminar** — sem ela, o índice
não avança e o processo estoura o heap, em vez de dar resultado errado.

⚠️ **A quarta condição espelha o produtor, não uma heurística inventada.** O `preprocessLatex` do
editor (`useRichTextEditor.ts`) casa inline com `[^$\n]+?` e display com `[^$]+?`: **inline nunca
contém quebra de linha, display pode.** É o mesmo argumento que sustenta a regra do espaço.

Sem ela, alternativas com preço viravam matemática inteira — `$5`⏎`b) $` é região plausível, e em math
mode a quebra de linha é só um espaço, então **nada estoura**: a prova sai com as alternativas em
itálico embaralhado e alguém imprime 200 cópias. Corrupção silenciosa exata, o modo de falha que esta
etapa inteira existe para evitar.

## Casos patológicos, decididos e não emergentes

| Entrada | Sai | Veredito |
|---|---|---|
| `$a$$b$` | duas fórmulas, `$a$` e `$b$` | Defensável. O scanner é ganancioso da esquerda |
| `$ x^2 $` | texto escapado, não fórmula | **Falso negativo aceito.** O editor *pode* gerar: o `insertLatex` não faz trim do que veio do `prompt` |
| `$50\%$` | intacto | a barra protege |
| `$50% off$` | `%` escapado, resto intacto | — |
| `US$ 40` | `US\$ 40` | pela regra do espaço, não pela âncora |
| `US$40` | abre fórmula se houver outro `$` adiante **na mesma linha** | **Erra. Limitação conhecida** |
| `$a \\% b$` | `%` escapado | Duas barras são quebra de linha; o `%` está cru. O critério é **paridade** de barras, não presença |
| `$$` sozinho | `\$\$` — dois cifrões escapados, visíveis | Fórmula inline vazia. Não abre por falta de fechamento; o defeito fica visível, que é o que se quer |
| `$$$$` | atravessa intacto | Display vazio. É o que o autor escreveu; renderiza uma caixa vazia |

⚠️ **Fim de string conta como "sem conteúdo".** Um `$` ou `$$` no fim não abre — não há fechamento
adiante, e a condição já cobre isso sem regra extra.

O buraco que sobra é o **cifrão solto**, e o enquadramento anterior desta spec o subestimava ao
chamá-lo de "prefixo de moeda": o caso dominante não tem prefixo nenhum.

```
'Custa $50 e o item_2 pesa $x$ kg'  →  'Custa $50 e o item_2 pesa $x\$ kg'
```

A prosa entra na região sem escape, o `_2` vira subscrito legítimo e **compila sem erro**. Estender a
âncora para `US`/`BRL` não conserta nada disso.

A quarta condição fecha a família multi-linha, que é a de conteúdo real (alternativas). O que resta é
tudo numa linha só, e fechá-lo exigiria heurística inventada — limite de tamanho de região, lista de
moedas. O espelhamento do produtor já foi até onde é justificável. Se aparecer no acervo, vira ticket
com um caso real na mão.

## Testes

`escape-latex.spec.ts` vem com o arquivo: os treze caracteres, os quatro que a lib abandonada não
cobre, a aspa dupla, a prova de que passada única é obrigatória, e a varredura do ASCII que impede a
classe do regex e o mapa de saírem de sincronia.

`escapar-fora-da-matematica.spec.ts`: uma fixture por linha da tabela de regras, uma por caso
patológico, mais:

- string vazia devolve vazia
- texto sem `$` atravessa igual ao `escapeLatex` puro
- `A resistência $R$ custa R$ 12,00 e a energia é $$E = mc^2$$` — os três comportamentos numa frase
- `$` no fim da string
- `$$` sozinho e `$$$$` — os dois casos de fórmula vazia, decididos na tabela acima

⚠️ **Cada uma das três condições precisa de um teste que fique vermelho quando ela é removida.** São
condições combinadas, e é fácil escrever um teste que passa por acidente porque **outra** condição já
rejeitava aquele caso.

## Riscos

| Risco | Mitigação |
|---|---|
| Heurística recusa fórmula legítima | Fixture por regra. Falso negativo sai como texto **visível**, não como conteúdo sumido |
| Heurística aceita dinheiro como fórmula | Idem, e o caso conhecido está registrado como limitação, não como bug oculto |
| Alguém "simplificar" a passada única do escaper | O teste que produz `\textbackslash\{\}` vem junto do arquivo |
| Lookbehind do `%` | Node ≥20 suporta; o piso do repo já é 20.19 |

## Critérios de aceitação

- [ ] Todas as fixtures passam
- [ ] `$\frac{1}{2}$` e `$$\int_0^1 x\,dx$$` saem **idênticos à entrada**
- [ ] `100% dos casos`, `C&A`, `a_b`, `#tag`, `a < b`, `a | b`, `{chaves}`, `""` escapados
- [ ] `A resistência $R$ custa R$ 12,00` — fórmula sobrevive, dinheiro vira `R\$`
- [ ] `custa $ 50 e $ 30` não vira fórmula
- [ ] `$50\%$` intacto; `$50% off$` com o `%` escapado
- [ ] `$` sem fechamento vira `\$`
- [ ] Cada condição do scanner tem teste que fica vermelho quando ela é removida
- [ ] Cobertura ≥ 90%
- [ ] `yarn build` produz `dist/main.js` na raiz

## Reflexos nos próximos cards

| Card | O que muda |
|---|---|
| 02 | Chama `escaparForaDaMatematica` em cada campo de texto da questão — `textoQuestao`, `pergunta`, `textoAlternativaA..E` — e no nome do simulado, para o `\def\cadernoTitulo` |
| 02 | Um erro deste card aparece no gate do Overleaf **do card 02**, misturado com os defeitos de lá. Foi escolha consciente: o `conteudo.tex` real é teste melhor que qualquer coisa montada à mão aqui |
