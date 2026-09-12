# Card 10 · Template versionado no Mongo: upload, publicação e lint

**Etapa:** Caderno · Overleaf · **Branch:** `feature/caderno-10-template-mongo` (de `develop`)
**Card:** `docs/prova-latex-overleaf/cards/10-template-no-mongo.md` · **Bloqueia:** cards 11, 12

---

## O que é

Tirar o layout do caderno do repositório e pôr no Mongo, versionado, para que quem quer mudar a capa
não precise de PR, review e deploy.

**Muda uma decisão do card 00.** Lá, a fonte da verdade era "o repo, e só ele". Passa a ser: o repo é
o **seed**; depois da migração, o Mongo manda. Os arquivos continuam em
`src/modules/caderno/templates/v1/` como semente, referência de dev e cópia de resgate — mas o serviço
não os lê em runtime.

⚠️ **Este card não muda a geração do zip.** Quem passa a montar o `main.tex` a partir do Mongo é o
card 11. Depois deste card, o zip da prova continua lendo do disco — e isso não abre janela ruim,
porque sem os cards 12 e 13 ninguém alcança estes endpoints para publicar nada.

---

## O que foi verificado antes de escrever

| premissa do card | medido |
|---|---|
| `BaseSchema` existe para estender | ✅ `src/shared/base/base.schema.ts` |
| transação Mongo é padrão do repo | ✅ usada em `base.repository.ts` e outros |
| `jszip` disponível para descompactar | ✅ veio com o card 04 |
| multipart funciona no ms | ✅ `@nestjs/platform-express`, `multer` transitivo — falta só `@types/multer` |
| índice parcial único tem precedente | ✅ `historico.schema.ts:63`, **com spec própria** |
| o template atual passa no lint proposto | ✅ nas 8 regras |

---

## O risco está no lint, e ele erra nos dois sentidos

O card diz que três travas tornam aceitável dar a um não-desenvolvedor o poder de parar a geração de
prova: **lint bloqueante, imutabilidade das versões publicadas, e restaurar de um clique.** Duas são
verificáveis por teste, e este card as testa a sério.

### A limpeza de comentários é load-bearing

Três regras dependem dela, e cada direção do erro tem um custo diferente:

**Não remover comentários** → um `\input{conteudo}` comentado passa no lint, e a prova **compila
perfeitamente e sai sem nenhuma questão**. É o caso realista: alguém comenta a linha depurando no
Overleaf e esquece de voltar.

⚠️ Isso não é hipótese. O `main.tex` de hoje **já tem** um `\input{preambulo}` dentro de comentário, na
linha 16 — um `includes` ingênuo conta duas ocorrências e não distingue qual é a real.

**Remover errado** — ignorando o `\%` escapado — engola texto válido e produz **falso positivo que
bloqueia um template bom**. O coordenador não consegue publicar e não entende por quê, depois de ter
visto o PDF compilar no Overleaf.

Por isso a limpeza vira **peça própria, testada isoladamente**, e não uma linha dentro de cada regra.

### As oito regras

**Bloqueiam a publicação (7):**

- `\documentclass` presente
- `\begin{document}` e `\end{document}`, um de cada
- `\input{preambulo}`, `\input{conteudo}` e `\input{metadados}` presentes
- `\begin{questions}` e `\end{questions}` presentes
- `\begin`/`\end` balanceados, por pilha
- proibidos: `\write18`, `\openin`, `\usepackage{shellesc}`, `\input`/`\include` com caminho absoluto ou `..`

⚠️ **`\input{sub/arquivo}` — relativo com barra — NÃO é bloqueado**, e isso é decisão, não lacuna. A
regra existe para impedir **sair** do diretório do projeto; um subcaminho relativo não sai. Ele
simplesmente não vai existir no zip da prova, e a falha aparece na compilação — visível, não
silenciosa.

Bloqueá-lo seria bloquear algo que não é perigoso e que o coordenador poderia usar legitimamente se um
dia o zip ganhar subpastas.

**Avisam, sem bloquear (2):**

- **chaves desbalanceadas** — decisão do usuário
- template referencia macro que o `metadados.tex` gerado não define (`\cadernoTitulo`,
  `\cadernoSubtitulo`, `\cadernoRascunho`)

⚠️ **Por que chaves não bloqueiam.** É a única regra que pode dar falso positivo num template válido:
LaTeX tem construtos onde chave desbalanceada é legítima (`\verb|{|`, mudança de catcode). As outras
sete são estruturais e não têm como ser burladas por acidente. E o template já passou por uma
compilação real no Overleaf antes do upload — o fluxo garante isso por construção.

O custo aceito: um template com chave faltando é publicado, e o erro aparece na próxima prova. O
restaurar de um clique resolve.

⚠️ **O lint roda duas vezes** — no upload, para feedback imediato; e de novo no publicar, porque o
rascunho pode ter vindo de uma restauração feita antes de uma regra nova existir.

---

## O modelo

Uma coleção, uma linha por versão, **publicada é imutável**. O esquema é o do card, sem alteração.

Índices, no estilo do `historico.schema.ts`:

```ts
CadernoTemplateSchema.index({ versao: 1 }, { unique: true });
CadernoTemplateSchema.index({ status: 1 });
CadernoTemplateSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'rascunho' } },
);
```

⚠️ O índice parcial é o que garante **no máximo um rascunho**. Ele é fácil de declarar errado e só
falha sob concorrência — por isso tem spec própria, como o do `historico`, e um teste com dois uploads
**concorrentes**, não sequenciais.

### Publicar e restaurar

**Publicar** = o rascunho vira `publicada` com `versao = max + 1`; a anterior vira `arquivada`. Numa
transação.

**Restaurar N** = cria um rascunho com o conteúdo de N e `origemVersao: N`. Publicar gera versão nova.

⚠️ **Histórico só avança.** Nada de ponteiro que anda para trás — nunca há dúvida sobre qual é a
atual, e "restaurei a v3 e depois subi outro zip" não cria estado esquisito.

---

## A extração do zip

O que ele sobe é o projeto **inteiro** do Overleaf: os dois arquivos que interessam, mais o mock, a
pasta `assets/`, provavelmente `main.pdf` e auxiliares.

| | |
|---|---|
| whitelist | só `main.tex` e `preambulo.tex`; o resto é descartado e **listado na resposta** |
| falta um dos dois | `400`, nomeando qual |
| busca | **case-insensitive**, e ignora pastas — o Overleaf pode pôr o nome do projeto como raiz |
| limites | zip ≤ 5 MB, arquivo ≤ 256 KB, ≤ 200 entradas |
| encoding | UTF-8 validado; bytes inválidos → mensagem clara |
| nome com `..`, `/` absoluto ou controle | **rejeita o zip inteiro** |

⚠️ O último não é higiene: nome de arquivo vindo de upload sem validação é *path traversal* na
montagem do zip da prova, no card 11.

⚠️ Os limites são checados **antes** de descompactar na memória. Um zip de 200 MB ou com 5000 entradas
não pode ser lido para depois ser rejeitado.

---

## Endpoints

Os sete do card, sem alteração. O único detalhe que vale repetir:

⚠️ **Erro de lint no upload → `200` com os erros**, não `4xx`. O rascunho é salvo de qualquer forma —
ele não perde o upload — e o `publicar` é quem recusa, com `409` e a lista.

`GET /template` sem versão publicada → **`503` explícito**, sem cair no repo. Depois deste card, o
Mongo é a fonte da verdade; um fallback silencioso ao disco reintroduziria a dúvida sobre qual é a
atual.

⚠️ `GET /template/teste` aparece no fluxo do card mas **é do card 11**. Não entra aqui.

---

## A migração de seed

`scripts/seed-template-caderno.ts`, no padrão do `backfill-criador-id.ts` — **não** em
`scripts/migrations/`, que o card cita.

Aquele diretório usa shell + mongosh (`cleanup.sh`, `indices.sh`, `validate.sh`), e este seed precisa
ler arquivos do repo e validá-los antes de inserir. TypeScript faz isso naturalmente; mongosh, não.

Insere a versão 1 como `publicada`, com `criadorId: 'system'` — mesma sentinela do
`backfill-criador-id` — e `notas: 'seed do repo'`. **Idempotente**: rodar duas vezes não duplica.

⚠️ O seed **valida com o próprio lint antes de inserir**. Um seed que entra sem passar pela régua que
todos os outros uploads passam é uma exceção que ninguém lembra depois.

---

## Testes

**Puros, sem Mongo** — é onde está o risco:

*Limpeza de comentários*
- `% \input{conteudo}` não conta como presente
- `\%` escapado **não** inicia comentário
- `100\% dos casos` sobrevive inteiro
- comentário no fim de linha com código antes preserva o código

*Lint — as sete que bloqueiam*
- cada uma, com um template que a viola e um que a satisfaz
- **`\input{conteudo}` só dentro de comentário → ERRO** (o caso mais perigoso do card)
- `\begin{questions}` sem `\end` → erro
- `\write18` → erro; `\input{/etc/passwd}` → erro; `\input{../x}` → erro
- **`\input{sub/arquivo}` → NÃO é erro** — a regra é sobre sair do diretório, não sobre ter barra
- `\input{preambulo}` legítimo não dispara a regra dos proibidos
- o `main.tex` + `preambulo.tex` **reais do repo** passam nas oito

*Lint — as duas que avisam*
- chave desbalanceada → **aviso, e o resultado permite publicar**
- macro não definida pelo `metadados.tex` → aviso

*Extração*
- zip do Overleaf com pasta raiz → funciona
- `Main.tex` maiúsculo → aceito
- sem `preambulo.tex` → 400 nomeando
- entrada `../x.tex` → rejeita o zip inteiro
- 5000 entradas ou 200 MB → rejeitado **sem descompactar**
- bytes não-UTF-8 → mensagem clara
- o resto do projeto é listado em `ignorados`

**Com Mongo (integração)**
- publicar: `versao = max+1`, anterior vira `arquivada`, `publicadaEm` preenchido
- **imutabilidade**: nenhum caminho de escrita altera uma `publicada` — testado por **todos** os
  métodos do repositório, não só o caminho feliz
- **um rascunho por vez**: dois uploads **concorrentes**, não sequenciais
- restaurar v2 → rascunho com `origemVersao: 2`; publicar gera v4
- seed roda duas vezes sem duplicar

## Critérios de aceitação

Os do card, mais:

- [ ] A limpeza de comentários tem spec própria e respeita `\%`
- [ ] Chave desbalanceada é **aviso**, e o publicar aceita
- [ ] O índice parcial tem spec própria, no molde do `historico.schema.spec.ts`
- [ ] O seed passa pelo próprio lint antes de inserir
- [ ] Cobertura ≥ 90% em `template/`
- [ ] `yarn build` gera `dist/main.js` **na raiz**

## Risco

**Médio, e de produto, não técnico.** Isto dá a um não-desenvolvedor o poder de parar a geração de
prova para todo mundo, sem compilador para barrar.

As três travas que tornam isso aceitável são o lint bloqueante, a imutabilidade e o restaurar. **Duas
delas são testáveis, e este card as testa a sério** — a terceira é de UI e mora no card 13.

Risco residual aceito: template que compila no Overleaf mas quebra com o `conteudo.tex` real. O lint
não pega, e o rollback resolve em um clique.

## O que este card NÃO faz

**Não muda a geração do zip da prova** — card 11.
**Não implementa `GET /template/teste`** — card 11.
**Não mexe em `templates.ts`, `zip.ts` nem nos arquivos do template.**
**Não toca em `logo.png` nem `LEIA-ME.txt`** — continuam assets do repo, por decisão do card.
