# Trocar a foto do cartão e pedir reprocessamento

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/09-FULL-reenviar-foto-e-reprocessar.md`
> Repos: `ms-simulado`, `api-vcnafacul`, `client-vcnafacul` · Branch nos três: `feature/09-reenviar-foto-e-reprocessar`
> **O último da série.** Cards `01`–`08b` mergeados.

---

## O pedido

> "o cursinho poderia alterar a foto do cartão, caso seja esse o motivo, e pedir para o sistema
> reavaliar o processo, tentando novamente"

## ♻️ Três afirmações do card que a investigação derrubou

### 1. O `acaoSugerida` já existe — e os valores propostos estão errados

O card propõe *"o mapa do card `01` ganha uma terceira coluna, `acaoSugerida`, com valores fechados —
`reenviar_foto` · `aguardar` · `falar_com_suporte`"*.

**Já existe**, desde o card `01` (`historico/falha/codigo-falha.ts`), e o conjunto real é outro:

```ts
export enum AcaoSugerida {
  /** Falhou a infraestrutura, não a imagem — a mesma foto serve numa nova tentativa. */
  Reprocessar = 'reprocessar',
  /** A foto precisa mudar: enquadramento, iluminação, marcadores cortados. */
  ReenviarFoto = 'reenviar_foto',
  /** Nada que o cursinho faça resolve. */
  FalarComSuporte = 'falar_com_suporte',
}
```

⚠️ **`aguardar` não existe em repo nenhum**, e `reprocessar` — que o card omitiu — é justamente o que
esta feature precisa. Os 13 códigos já estão mapeados, e o docblock do arquivo **nomeia este card**
como o consumidor.

O client já **tipa** `AcaoSugerida` em `FalhaHistorico` (`dtos/cartaoResposta/resultados.ts`), e
**nenhum componente lê o campo**. O backend dessa seção está pronto; falta só a tela ramificar.

### 2. O risco do cache é pior, está dormente, e some com uma decisão de desenho

O card diz *"TTL de 180s… um reprocesso dentro de 3 minutos faz o OMR ler a foto anterior"*.

Três correções. O `primeImagem` vive na **api**, não no ms. Ele escreve com 180s — mas o ms-omr, ao ler
por falta (`image_source.py`, cache-first), **recarimba a mesma chave com `omr_cache_ttl_seconds`, que
é 3600**. A janela real é de até **uma hora**.

E o risco está **dormente**: `imageKey` é `cartoes/<simuladoId>/<uuid>.jpg`, com uuid novo a cada
upload. Colisão é impossível hoje. **Ele só nasce se o desenho reusar a chave** — ver a decisão abaixo.

### 3. A proposta de rate limit era inimplementável

O card manda a janela ser *"maior que os 180s do cache"*. Com o TTL real de 3600s, isso seria uma hora
de espera entre tentativas. Ninguém espera uma hora para reenviar uma foto.

⚠️ **A amarra some junto com o risco:** cunhando chave nova, a janela passa a ser escolhida por
ergonomia.

---

## A decisão central: chave nova a cada tentativa

**Não reusar o `imageKey`. Cunhar um novo, como o upload original já faz.**

Quatro consequências, e é o conjunto que justifica:

1. ⚠️ **O risco do cache deixa de existir** — não há o que invalidar, porque a chave é inédita. A
   alternativa (regravar o cache com os bytes novos) depende de o `primeImagem` ter sucesso, e ele
   **engole erro e só loga**: um piscar do Redis serviria a foto velha por até uma hora, com o
   cursinho concluindo que o sistema quebrou.
2. **Callback atrasado não atropela.** `findByImageKey` é um `findOne({ imageKey })`; trocada a chave,
   um callback da tentativa anterior não acha mais o histórico e vira no-op — o `CartaoCallbackService`
   já loga e retorna nesse caso.
3. **A foto original fica no bucket** em vez de ser sobrescrita. Audível depois, se alguém perguntar.
4. **O índice permite.** `HistoricoSchema.index({ imageKey: 1 }, { unique: true, partialFilterExpression:
   { imageKey: { $type: 'string' } } })` — atualizar o próprio documento para um uuid novo não colide
   com ninguém.

---

## O contrato

### ms-simulado

`POST /v1/cartao-resposta/:historicoId/reprocessar`, corpo `{ cursinhoId, imageKey? }`.

⚠️ **O `cursinhoId` vai no CORPO, não no caminho.** Lição medida no card `07`: um path param cru
deixou o chamador reescrever a URL que a api manda ao ms — um `%3F` embutido sobrepunha o `cursinhoId`
resolvido do JWT e devolvia dados de outro cursinho. O `encodeURIComponent` fechou aquilo; não
reabrir a mesma porta com um parâmetro novo.

**O gate é o filtro.** A junção `RelatorioSimuladoEstudante` tem índice único em
`{simulado, cursinhoId, usuario}` e guarda `historico`. Achar a linha por `{ historico, cursinhoId }` é
uma leitura que **já não encontra** histórico de outro cursinho. Sem linha → **404**.

⚠️ **Mas isso é verdade sobre o filtro, e não sobre quem escolhe o argumento.** O `cursinhoId` só é
confiável porque sai do JWT na api e viaja no corpo. É a mesma frase que este projeto já escreveu
errado uma vez.

**Recusa quando o status não é `failed`** — 409. Reprocessar um cartão que está lendo ou já leu não é
uma operação que faça sentido, e permitir isso abriria corrida com o callback em voo.

**Uma escrita só:**

```
$set   { status: awaiting_omr, imageKey: <nova ou a mesma>, ultimaTentativaEm: now }
$unset { falha: '' }
```

⚠️ **Numa operação, não em duas.** O docblock do `marcarFalha` já antecipa este card:
*"o card 09 precisa da operação inversa (voltar o status e `$unset` a falha), e em duas escritas existe
uma janela em que a tela mostra 'processando' com a mensagem de erro anterior ao lado."*

Depois, aciona o OMR. **Se o acionamento falhar**, `marcarFalha(omr_indisponivel)` — o mesmo padrão do
`CartaoHistoricoService.criar`.

⚠️ **Registrado, não consertado:** esse caminho **perde o diagnóstico original**. O `$unset` já apagou
a falha antiga, e a nova diz "não foi possível acionar a leitura" em vez de "cartão não detectado". A
pessoa acabou de agir sobre o motivo antigo, então a perda é aceitável — mas é uma perda.

### api-vcnafacul

`POST /mssimulado/cartao-resposta/:historicoId/reprocessar` — multipart, arquivo **opcional**.

Permissão **`gerenciarEstudantes`**, alinhada ao relatório de onde a ação nasce.

⚠️ **Inconsistência registrada:** o upload de cartão que já existe exige `visualizarEstudantes`. Quem
sobe cartão não consegue consertar o que subiu. **Este card não mexe nisso** — mudar permissão de rota
em produção escondida num PR de feature é o tipo de coisa que a série recusou a fazer três vezes.

**Com arquivo** (`reenviar_foto`): decodifica o QR → cunha `imageKey` novo → **bucket → cache →
chama o ms**, exatamente a ordem do upload original. Essa ordem importa: se o cache falhar, o OMR busca
do bucket, que já tem a foto certa. Invertida, o cache vira a fonte da verdade.

**Sem arquivo** (`reprocessar`): chama o ms sem `imageKey`, e a chave atual é mantida.

#### ⚠️ O QR da foto nova precisa ser o mesmo cartão

**O card não menciona, e sem isso o sistema aceita a folha errada.** O coordenador escolhe o arquivo à
mão; nada impede que seja a folha de outro aluno, ou de outro simulado. Decodificado o QR, comparar
`simuladoId` e `cartaoCode` com os do histórico e **recusar com 400** se divergir, dizendo o que
divergiu.

Sem essa checagem, as respostas de um aluno entram no histórico de outro — e o relatório fica
convincentemente errado.

⚠️ **A comparação mora no ms, não na api** — é lá que o histórico está, e pedir os valores esperados
antes só para comparar na api seria uma ida a mais para chegar à mesma conclusão. A api decodifica o
QR e manda `simuladoId` e `cartaoCode` junto; o ms confere contra o documento.

⚠️ **O preço, assumido: uma imagem órfã no bucket quando o QR diverge.** A api grava o bucket antes de
chamar o ms, então uma recusa deixa o arquivo lá. O `CartaoUploadService` tem um comentário dizendo
que resolve o vínculo *"ANTES de tocar no bucket"* justamente para não criar órfãs — aqui não dá, sem
uma ida extra ou uma escrita em duas fases, e as duas custam mais do que uma imagem perdida quando um
humano escolhe o arquivo errado. **Logar quando acontecer**, para não virar crescimento silencioso.

#### ⚠️ E um limite de tamanho, que hoje não existe

O `FileInterceptor('file')` da rota de upload **não passa `limits`**, e o `json({ limit: '30mb' })`
global não vale para multipart. A rota de upload é, na prática, ilimitada. A rota nova nasce com
limite explícito — e o card deixa registrado que a antiga não tem.

### O rate limit mora no histórico

Campo novo `ultimaTentativaEm`. ⚠️ **Não há de onde derivar:** `HistoricoSchema` é
`@Schema({ timestamps: false, versionKey: false })` — não existe `createdAt` nem `updatedAt`.

**Janela de 60s**, e a escolha agora é livre porque a amarra do cache morreu com a chave nova. Sessenta
segundos barra duplo clique e laço acidental; e como é **por histórico**, quem corrige dez cartões
diferentes nunca esbarra.

⚠️ **A recusa diz o tempo que falta**, não um erro genérico: *"Aguarde 2min12s para tentar novamente"*.
Um 429 sem número manda a pessoa tentar de novo na hora, e de novo.

⚠️ **Sem estado externo, sem Redis** — o campo no próprio documento é naturalmente correto com várias
instâncias.

---

## A tela

**No modal de detalhe do estudante** (`DetalheDoEstudante`, do card `07`). Ele já abre pela linha do
relatório, já renderiza a descrição da falha, e tem espaço para o seletor e para o aviso de espera.

⚠️ **Ele não recebe o `historicoId` hoje** — as props são `{token, simuladoId, estudante, isOpen,
onClose}`, e o id vive na linha do relatório (`LinhaDoRelatorio.historicoId`). Passar adiante é
trabalho deste card.

⚠️ **Não na coluna Motivo.** Ela é **deliberadamente** uma string crua: o `DashTable` só pendura
`title` em texto, e embrulhar num elemento perde o tooltip e trunca o motivo em ~245px. A decisão está
documentada no `colunas.tsx` e não se reabre aqui.

**A tela ramifica no `acaoSugerida`, e não conhece código de erro nenhum:**

| `acaoSugerida` | o que aparece |
|---|---|
| `reenviar_foto` | seletor de arquivo + "Reenviar foto" |
| `reprocessar` | "Tentar de novo", **sem** seletor — a mesma foto serve |
| `falar_com_suporte` | nada |

⚠️ **As duas ações, não só uma.** O card previa só `reenviar_foto`. Mas `motor_timeout`,
`armazenamento_indisponivel` e `omr_indisponivel` mapeiam para `reprocessar` — infra que falhou, foto
intacta. Não oferecer isso faz o cursinho **refotografar à toa**, que é exatamente o que o card diz
querer evitar quando fala de `template_ausente` e `motor_timeout`.

Depois de disparar, a tela mostra que está processando. ⚠️ **Não inventar polling neste card** — o
modal fecha e o coordenador reabre; uma tela que se atualiza sozinha é outro assunto.

---

## Riscos

⚠️ **O gate do `status === 'failed'` no client é carga.** O `colunas.tsx` só mostra o motivo quando o
status é `failed` porque nada limpava a `falha`. Este card passa a limpá-la — mas o gate continua
necessário, porque o `completeProcessing` ainda não toca nela. **Não remover aquele gate achando que
este card o tornou desnecessário.**

⚠️ **Documentos antigos não têm `ultimaTentativaEm`.** O campo é opcional e a ausência significa
"nunca tentou" — primeira tentativa liberada. Não precisa de migração.

⚠️ **Nada tira um histórico de `failed` hoje.** Este card cria a primeira transição de saída, e o
`claimForProcessing` filtra `status ∈ {pending, processing}` — conferir que o caminho novo
(`awaiting_omr` → callback → `pending`) passa por ele como o fluxo normal passa.

## Fora de escopo

- Reprocessamento em lote.
- Varredura de `awaiting_omr` órfãos — o buraco existe **hoje** no fluxo normal se o processo morrer
  entre o `createAwaitingOmr` e o callback. Card próprio.
- Mudar a permissão do upload existente.
- Pôr limite de tamanho na rota de upload existente — registrado, não feito.
- Polling ou atualização automática do relatório.

## Critérios de aceite

- [ ] A ação aparece só quando há `acaoSugerida`, e **qual** ação depende do valor
- [ ] `reenviar_foto` pede arquivo; `reprocessar` não pede; `falar_com_suporte` não oferece nada
- [ ] Reenvio opera sobre o histórico existente — **nunca cria um segundo**
- [ ] **A foto nova é a que o OMR lê**, inclusive reprocessando em segundos — provado por teste
- [ ] `imageKey` novo a cada troca de foto
- [ ] QR divergente (outro simulado ou outro cartão) é **recusado com 400**
- [ ] Status e `falha` mudam na **mesma escrita**
- [ ] Falha ao acionar o OMR volta o histórico para `failed`, com motivo
- [ ] Reprocessar histórico que não está `failed` dá 409
- [ ] Rate limit por histórico, 60s, com **tempo restante** na mensagem
- [ ] Reprocessar cartão de outro cursinho dá 404 — teste de isolamento
- [ ] `cursinhoId` vai no corpo, nunca no caminho
- [ ] `gerenciarEstudantes` nas duas pontas
- [ ] A rota nova tem limite de tamanho de arquivo
