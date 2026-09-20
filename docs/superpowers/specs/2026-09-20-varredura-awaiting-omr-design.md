# Varredura de `awaiting_omr` preso — design

**Card:** `docs/cards/relatorio-simulado-cursinho/13-BACK-awaiting-omr-preso-para-sempre.md`
**Repo:** `ms-simulado` · **Branch:** `feature/13-varredura-awaiting-omr`
**Data:** 2026-09-20 · Repo único, sem lockstep.

---

## 1. O defeito

Um histórico entra em `awaiting_omr` e só sai por duas portas: o **callback** do ms-omr, ou o
tratamento de erro de quem o acionou.

⚠️ **Se o ms-omr aceita a requisição e o callback nunca chega, não há terceira porta.**

As três premissas do card foram verificadas no código:

| premissa | verificação |
|---|---|
| `recoverPending()` não cobre `awaiting_omr` | ✅ `simulado/answer-processor.service.ts:30` varre `findByStatuses([Pending, Processing])`, e só na subida |
| O card 09 responde 409 | ✅ `cartao-reprocesso.service.ts:68` lança `ConflictException` para todo status ≠ `Failed` |
| O buraco é anterior ao card 09 | ✅ o 09 trata o ms-omr **recusar** (catch → `marcarFalha`); o descoberto é ele **aceitar e não voltar** |

### O ms-omr já previu este card

`ms-omr/app/services/omr_pipeline.py:100-119` nomeia as **duas** saídas que não produzem callback:

1. **O `job_timeout` do arq (180s).** Nasce no `asyncio.wait_for` do próprio arq, fora da coroutine:
   chega um `CancelledError`, que é `BaseException` e não é capturado.
2. **O POST do callback falhando nas três tentativas.** Aí `_retry_ou_desistir` só loga.

E encerra com: *"Nos dois casos o histórico fica em `awaiting_omr` até a varredura periódica (card
próprio)."* Este é o card próprio.

### Por que importa agora

O buraco existe desde que o cartão-resposta existe. O que mudou é que a série construiu um relatório
onde o coordenador **vê** o cartão e tem um botão para agir — e este é o único estado em que a tela
promete uma ação que o backend recusa com 409.

## 2. A janela: 1 hora

**Pior caso de processamento, medido no `ms-omr`:**

```
job_timeout = 180s (worker.py:9) × max_tries = 3        → 540s
backoff entre tentativas: defer = n × 30s (30 + 60)     →  90s
                                              TOTAL     → 630s = 10,5 min
```

⚠️ **Mas o processamento não é o que domina.** `omr_max_workers = cpu_count() - 1` (`config.py:37`),
e a VPS de homol tem **1 vCPU** → **um worker, em série**. Numa turma que sobe 50 cartões, o último
espera 49 leituras na fila **antes de começar**.

Não há medição do tempo médio de uma leitura. A 30s por cartão, 50 cartões são 25 minutos só de fila.
Por isso a janela é **1 hora** e não os ~15 min que o pior caso de processamento sugeriria: uma
janela curta mataria cartão que está legitimamente esperando, e a varredura viraria a causa do
problema que deveria resolver.

### O falso positivo é barato — e isso é verificado, não presumido

MEDIDO: `cartao-callback.service.ts:29` acha o histórico por `findByImageKey(input.imageKey)` e
aplica o resultado **sem checar status**. Então um callback que chegue depois da varredura sobrescreve
o `failed` com o resultado real.

⚠️ **Essa mesma ausência de guarda é o defeito do card `14`.** Ver §7.

## 3. A idade: `ultimaTentativaEm` com fallback no `_id`

⚠️ O schema é `@Schema({ timestamps: false })` — **não há `createdAt` nem `updatedAt`**. E
`createAwaitingOmr` (`historico.repository.ts:253`) **não grava `ultimaTentativaEm`**: só o
`reabrirParaOmr` do card 09 grava. Um cartão de primeira viagem não tem data nenhuma.

```ts
{
  status: HistoricoStatus.AwaitingOmr,
  $or: [
    { ultimaTentativaEm: { $lt: corte } },
    {
      ultimaTentativaEm: { $exists: false },
      _id: { $lt: Types.ObjectId.createFromTime(Math.floor(corte.getTime() / 1000)) },
    },
  ],
}
```

**O `$or` não é enfeite — cada ramo resolve um caso que o outro não alcança:**

- **Primeiro ramo:** respeita o reprocesso. Um cartão criado há 3 dias mas reenviado há 1 minuto
  **não** pode ser varrido; a idade que importa é a da última tentativa.
- **Segundo ramo:** alcança os que já estão presos hoje, usando o timestamp que o ObjectId do Mongo
  embute. **Sem migração** — que é o ponto, já que os documentos presos são justamente os que
  motivaram o card.

## 4. O código de falha

`codigo-falha.ts` ganha `LeituraNaoRetornou = 'leitura_nao_retornou'`, e `mapa-falha.ts` a entrada:

```ts
[CodigoFalhaInterno.LeituraNaoRetornou]: {
  descricao:
    'A leitura do cartão não retornou a tempo. Tente processar novamente.',
  acaoSugerida: AcaoSugerida.Reprocessar,
},
```

⚠️ **`Reprocessar`, e não `FalarComSuporte`.** A foto está boa; quem falhou foi a infraestrutura, e o
coordenador resolve sozinho. É isto que devolve a linha ao fluxo do card 09 — sem o mapeamento certo,
a varredura troca "preso em processando" por "falha que ninguém pode resolver", o que não é progresso.

O `MAPA` é tabela explícita com fallback para código desconhecido, então a entrada nova é aditiva.

## 5. O serviço

`CartaoVarreduraService`, no módulo `cartao-resposta`, junto do `cartao-reprocesso.service.ts`.

```ts
@Cron(CronExpression.EVERY_10_MINUTES)
```

Janela de 1 hora e varredura a cada 10 minutos: um cartão preso é liberado entre **60 e 70 min**.

⚠️ **Roda periodicamente, não só na subida** — que é critério de aceite explícito do card: o processo
pode não reiniciar por dias, e foi por isso que o `recoverPending()` não bastou.

O `ScheduleModule.forRoot()` **já existe** (`content.module.ts:32`, e `ContentModule` está no
`app.module.ts:49`). Ele descobre `@Cron` de qualquer provider da aplicação. ⚠️ **Isto precisa de
teste**: se a descoberta não alcançar o novo serviço, o card falha em silêncio — o pior modo de
falha possível para um conserto que existe justamente para acabar com o silêncio.

Reusa `marcarFalha`, que grava status e motivo numa **única** escrita (o docblock dele registra por
quê: em duas escritas existe uma janela mostrando o status novo com a falha velha ao lado).

### Segura sob múltiplas instâncias

O deploy roda `~/subir_ms.sh` no servidor, que não está no repo — não dá para saber daqui se o PM2
está em modo cluster.

Não precisa saber: **a operação é idempotente por construção.** A query filtra por
`status: awaiting_omr`, então uma segunda instância concorrente não encontra mais nada, e remarcar um
`failed` como `failed` com o mesmo motivo não muda o documento. Isto é propriedade de design, não
sorte.

## 6. Testes

`cartao-varredura.service.spec.ts`:

1. `awaiting_omr` com `ultimaTentativaEm` mais velho que a janela → `marcarFalha` com o código novo
2. `awaiting_omr` com `ultimaTentativaEm` **recente** → não é tocado
3. ⚠️ `awaiting_omr` **sem** `ultimaTentativaEm` e com `_id` antigo → varrido (o ramo do ObjectId)
4. ⚠️ `awaiting_omr` **sem** `ultimaTentativaEm` e com `_id` recente → não é tocado
5. Status diferente de `awaiting_omr` → nunca é tocado
6. Nada para varrer → não chama `marcarFalha` e não loga ruído
7. ⚠️ O serviço expõe `@Cron` e o `ScheduleModule` o descobre
8. `leitura_nao_retornou` mapeia para `Reprocessar` em `mapa-falha.spec.ts`

**Mutações que os testes precisam matar:** trocar `$lt` por `$gt` · remover o ramo do `_id` · remover
o filtro de `status` · trocar `Reprocessar` por `FalarComSuporte` · encurtar a janela para minutos ·
remover o `@Cron`.

## 7. ⚠️ A interação com o card 14 — precisa ir para o card dele

O card `14` vai pôr guarda no callback (hoje ele acha por `imageKey` e aplica sem checar status).

**Se essa guarda recusar callback sobre um histórico `failed`, ela remove a rede de segurança que
torna a janela de 1 hora aceitável** (§2): um cartão varrido por engano deixaria de se auto-corrigir.

A guarda do `14` precisa **aceitar** callback tardio quando o `failed` tem o código
`leitura_nao_retornou` — esse é precisamente o estado "achamos que não vinha, mas veio".

Isto será registrado no card 14 como parte deste trabalho.

## 8. Fora de escopo

- **Notificar alguém.** Devolver a linha ao estado acionável já resolve o caso de uso.
- **Retentativa automática.** Se o OMR não voltou, tentar sozinho empilha trabalho num serviço que já
  está mal. O card diz isso explicitamente.
- **Gravar `ultimaTentativaEm` na criação.** O ramo do `_id` já cobre, e sem migração.
- **Reduzir o `job_timeout` ou aumentar workers no ms-omr.** Outro repo, outro problema.

## 9. Critérios de aceite

- [ ] `awaiting_omr` mais velho que 1 hora vira `failed` com `leitura_nao_retornou`
- [ ] A janela é maior que o pior caso do OMR com as retentativas do `arq` (630s) **e** com folga para
      a fila de um worker só
- [ ] O código novo mapeia para `Reprocessar`, e a linha fica acionável pelo card 09
- [ ] A varredura não toca em `awaiting_omr` recente — nem pelo `ultimaTentativaEm`, nem pelo `_id`
- [ ] Roda periodicamente, não só na subida, e há teste de que o `@Cron` é descoberto
- [ ] A interação com o card 14 registrada naquele card
- [ ] Suíte, build e lint limpos
