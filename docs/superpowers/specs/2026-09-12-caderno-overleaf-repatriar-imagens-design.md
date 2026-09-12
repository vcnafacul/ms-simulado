# Card 08 · Repatriar as imagens externas para o nosso bucket

**POC:** Caderno · Overleaf · **Branch:** `feature/caderno-08-repatriar-imagens` (de `poc/caderno-overleaf`)
**Card:** `docs/prova-latex-overleaf/cards/08-repatriar-imagens-externas.md` · **Depende de:** card 03 (mergeado)

---

## O que é

Um comando de manutenção que baixa cada imagem hospedada fora, salva no nosso R2 e **reescreve a
referência dentro da questão**:

```
![](https://enem.dev/2016/questions/3/812288c1-….png)
     ↓
![](asset://assets/<sha256 da url>.png)
```

Não é endpoint e não roda no fluxo de geração. É o último card da POC, e ataca a **causa** do que os
cards 02 e 03 tiveram de contornar.

## Por que vale, além do caderno

1. **A imagem some sem aviso.** O dia em que o `enem.dev` sair do ar, o acervo perde as figuras — no
   simulado digital também, não só no caderno.
2. **Vaza navegação.** Todo aluno que abre a questão faz requisição a um terceiro, com Referer.
3. **É requisição de saída a partir de dado editável.** Enquanto a URL vive no texto da questão,
   qualquer coisa que a resolva precisa se defender de SSRF. Repatriar **elimina a classe**.
4. Só então: o zip do caderno para de depender de rede alheia.

**Decisão do usuário sobre direito autoral:** repatriar. As provas são divulgação oficial do INEP, o
uso é educacional sem fins lucrativos, e as imagens já são exibidas aos alunos hoje via hotlink.

---

## O acervo, medido

⚠️ **Medido em HOMOLOGAÇÃO**, em 2026-09-12. Todos os `.env` deste checkout apontam para homol —
inclusive as medições dos cards 04 e 07, que eu havia descrito como "produção" e estavam erradas.

| | |
|---|---|
| questões com URL externa | **728** |
| ocorrências totais | **840** |
| URLs distintas | **818** |
| URLs usadas por mais de uma questão | **17** |
| host | `enem.dev`, 840 de 840 |
| tamanho médio | ~79 KB |
| total projetado | **~64 MB** (de 10 GB do free tier) |
| amostra de 30 URLs | **30 vivas, 0 mortas** |

⚠️ **Se produção tiver acervo diferente, estes números mudam.** O `--dry-run` é quem dirá, antes de
qualquer escrita.

---

## Três correções ao card, todas medidas

### 1. O filtro do card migraria zero questões

O card diz *"para cada questão com `contentFormat === 'markdown'`"*. Das **728** questões com URL
externa, **nenhuma** é markdown — são `plain` ou o campo nem existe. No acervo inteiro só duas
questões são markdown, e não são essas.

**O critério passa a ser o texto**, não o `contentFormat`: qualquer questão com `![…](http…)` ou
`<img src="http…">` em algum campo.

### 2. URL morta é problema teórico

Amostra de 30 das 818: todas vivas. A política ainda existe — **deixar a questão como está**, contar
no relatório final — mas não é o eixo do card. Não piorar é o mínimo, e é o que fazemos.

### 3. A chave no R2 é derivada da URL, não um uuid

`assets/<sha256(url)>.<ext>`, e **não** `assets/<uuid>.<ext>` como o `uploadAsset` da api.

⚠️ **É o que sustenta a regra de ordem abaixo.** Com uuid, uma falha ao gravar a questão deixaria a
imagem no R2 sem nada apontando para ela — a re-execução baixaria de novo e criaria uma segunda cópia.
Com chave determinística, a re-execução encontra o objeto, pula o download, e só atualiza o Mongo.

Traz dedup de brinde (22 downloads a menos em 840). O acoplamento que isso normalmente criaria —
apagar a questão A levando a imagem da B — é **inerte aqui**: medido, não existe nenhum fluxo que
apague asset, nem no `ms-simulado` nem no `api-vcnafacul`.

---

## A ordem de escrita, que é o coração do card

Por ocorrência, e nesta ordem:

```
1. baixa           reusa buscador-http.ts + endereco-seguro.ts do card 03
2. extensão        pelos magic bytes (formato.ts do card 03)
3. já está no R2?  HEAD na chave determinística
4. não → PUT       no BUCKET_QUESTION
5. confirma        o objeto está lá
6. SÓ ENTÃO        atualiza a questão
```

| onde falha | o que acontece |
|---|---|
| passos 1–5 | a questão **não é tocada**; nada se perde |
| passo 6 | a imagem fica no R2, a questão fica intacta, e a re-execução retoma do passo 3 **sem rebaixar** |

⚠️ **Nunca escrever a questão antes de confirmar a imagem.** Uma questão apontando para uma key que
não existe é pior que a URL externa: a imagem some, e some silenciosamente.

### ⚠️ Não usar o `updateContent` do repositório

O caminho óbvio, e é armadilha. `QuestaoRepository.updateContent` escreve também `alternativa`,
`textClassification` e `alternativeClassfication`.

**`alternativa` tem `select: false` no schema** — uma leitura normal não traz o valor. Um
read-modify-write por ali não tem como preservar o que não consegue ler.

O script faz `updateOne` com `$set` **apenas nos campos de texto que ele mesmo alterou**. Nada mais.

---

## O desfazer

⚠️ **O `auditLog` não serve.** Ele guarda só o valor novo (`changes: JSON.stringify({status, message})`),
não o anterior — e o `updateContent` do service nem chama o log.

Então o script grava um **arquivo de reversão** antes de escrever a primeira questão:

```json
{"questaoId": "...", "campo": "textoQuestao", "original": "<texto inteiro, antes>"}
```

Uma linha por campo alterado, gravada **antes** da escrita correspondente. O `--reverter <arquivo>`
devolve os campos ao estado anterior.

⚠️ **As imagens ficam no R2 no rollback, de propósito.** Apagá-las jogaria fora o que já foi baixado, e
a chave determinística faz a próxima corrida reaproveitá-las.

Registra também no `auditLog`, para rastreabilidade — mas o arquivo é o que reverte.

---

## A interface

```
yarn repatriar:imagens [--dry-run] [--limite N] [--questao <id>] [--reverter <arquivo>]
```

No espírito do `backfill:criador-id` que já existe em `scripts/`.

⚠️ `--dry-run` **não escreve em lugar nenhum**: nem Mongo, nem R2. Ele baixa? **Não** — só resolve o
que faria, lista as URLs e diz quantas questões e campos seriam tocados. Baixar 64 MB para um ensaio
não acrescenta informação que o relatório não dê.

### A ordem de execução

1. `--dry-run` completo, conferindo a contagem contra os números acima
2. `--limite 5`, e conferir as cinco questões na tela
3. Corrida completa
4. **Métrica de sucesso, que já existe:** o gerador do card 02 deve passar a produzir **zero**
   `ImagemRef` com `origem: 'url'`

---

## Defesa na busca

`endereco-seguro.ts` e `buscador-http.ts` do card 03 já fazem o necessário — faixas privadas,
redirecionamento manual com re-checagem por salto, timeout, teto de bytes contado durante a leitura.
O script **reusa**, não reimplementa.

⚠️ Aqui a requisição de saída é o objetivo, não efeito colateral. Mas as URLs vêm do banco, e o texto
da questão é editável por administrador — a defesa continua valendo pelo mesmo motivo de sempre.

---

## Testes: sem tocar em homol

⚠️ Não há `mongodb-memory-server` no `ms-simulado`. Os testes são unitários, com as **três fronteiras
injetadas** — busca HTTP, storage e repositório — no mesmo estilo do card 03. Nenhum teste fala com
homologação nem com o R2.

- questão com uma URL → baixa, PUT, e só então `$set` no campo certo
- **falha no PUT → a questão NÃO é tocada**
- **falha no `$set` → a imagem permanece; a re-execução não rebaixa** (o HEAD encontra)
- objeto já no R2 → pula o download, atualiza só o Mongo
- a mesma URL em dois campos da mesma questão → um download, duas substituições
- URL morta → questão intacta, contada no relatório
- formato não suportado (GIF/WEBP) → questão intacta, contada
- endereço privado recusado → questão intacta, contada
- questão já com `asset://` → ignorada (idempotência)
- `--dry-run` → **zero** chamadas de escrita, em Mongo e em R2
- o arquivo de reversão é escrito **antes** da primeira escrita
- `--reverter` devolve o texto exato
- o `$set` toca **apenas** os campos de texto alterados — nunca `alternativa`

## Critérios de aceitação

- [ ] Todos os testes acima
- [ ] Cobertura ≥ 90% no script
- [ ] `--dry-run` contra homol bate com os números medidos
- [ ] `yarn build` limpo, e o script **fora** do `tsconfig.build.json`
- [ ] Nenhuma mudança no `updateContent` do service nem do repositório

⚠️ O último item de build não é detalhe: `.ts` fora de `src/` desloca o `rootDir` inferido e move o
`dist/main.js`, quebrando o PM2 com "Script not found". O `backfill-criador-id.ts` já vive com essa
regra.

## Gate

O `--dry-run` contra homologação, com o relatório conferido contra os números desta spec. Depois,
`--limite 5` e a conferência das cinco questões.

**A corrida completa é decisão do usuário**, não do implementador.

## Risco

**Médio-alto, e não pela lógica.** A lógica é um laço com uma ordem bem definida. O risco é a
irreversibilidade de uma migração em massa — e é por isso que o arquivo de reversão vem antes da
primeira escrita, e não depois.

O segundo risco é o `updateContent`: é o caminho que qualquer um pegaria, e ele escreve campos que
este card não deveria tocar.
