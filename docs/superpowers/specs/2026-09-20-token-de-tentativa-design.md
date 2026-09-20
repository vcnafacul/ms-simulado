# Token de tentativa no callback do OMR — design

**Card:** `docs/cards/relatorio-simulado-cursinho/14-BACK-callback-sem-token-de-tentativa.md`
**Repos:** `ms-omr` + `ms-simulado` · **Branch:** `feature/14-token-de-tentativa`
**Data:** 2026-09-20 · ⚠️ **Dois repos, deploy lockstep.** Último card da série.

---

## 1. O defeito

`CartaoCallbackService` acha o histórico por `findByImageKey(input.imageKey)` e aplica o resultado —
sem token de tentativa e sem guarda de status. Um callback **atrasado** de uma tentativa antiga é
aplicado ao estado atual, como se fosse novo.

**No caminho `reenviar_foto` não morde**, e isso é de propósito: aquele fluxo cunha `imageKey` nova a
cada foto, então o callback da tentativa anterior não acha mais o histórico. Foi uma das razões de
cunhar chave nova.

**No caminho `reprocessar` morde**, porque ali a chave é reusada de propósito — a foto não mudou:

1. Tentativa 1 falha; o callback marca `failed`.
2. O coordenador aperta "tentar de novo"; o histórico volta a `awaiting_omr`, **mesma chave**.
3. O `arq` reentrega a tentativa 1 (`omr_max_tries: 3`) e o callback antigo chega.
4. É aplicado: a linha volta a `failed` com o motivo velho, **desfazendo em silêncio** o pedido.

O coordenador vê a tentativa "falhar instantaneamente" pelo mesmo motivo e conclui que o sistema
ignorou o clique.

### Alternativas descartadas por medição

- **Embutir o token na `imageKey`.** Quebra: o ms-omr usa a chave para `obter_imagem(image_key)` e
  `parse_simulado_id(image_key)` — um sufixo faria o storage não achar o objeto.
- **Cunhar `imageKey` nova também no reprocesso.** Exigiria copiar o objeto no R2 sem que a foto
  tenha mudado. O card 09 decidiu contra, e este card não reabre a decisão.
- **Contar acionamentos e callbacks.** Não distingue *qual* tentativa respondeu, que é justamente o
  problema.

Sobra o token. E ele **mexe no contrato com o ms-omr** — por isso é card próprio e não uma linha no 09.

## 2. O contrato

Hoje, medido nos dois repos:

```
ms-simulado → ms-omr :  POST /omr/process  {imageKey}
ms-omr → ms-simulado :  callback           {imageKey, respostas|falha}
```

Passa a ser, com o campo **opcional nas duas pontas**:

```
ms-simulado → ms-omr :  POST /omr/process  {imageKey, tentativaId?}
ms-omr → ms-simulado :  callback           {imageKey, tentativaId?, respostas|falha}
```

## 3. A guarda

Em `CartaoCallbackService`, antes de aplicar:

| situação | decisão | por quê |
|---|---|---|
| `tentativaId` bate com o do histórico | **aplica** | é a resposta da tentativa corrente |
| `tentativaId` não bate | **descarta**, com log | é o defeito deste card |
| `tentativaId` **ausente** no callback | **aplica**, com log | ms-omr ainda velho, ou job enfileirado antes |
| histórico **sem** `tentativaId` | **aplica**, com log | documento criado antes deste card |

⚠️ **As duas últimas linhas não são frouxidão — são o que faz isto sobreviver ao deploy.** Se o
ms-simulado novo exigisse token e o ms-omr velho não o mandasse, **todo callback do período seria
descartado** e todo cartão ficaria preso. A varredura do card 13 só os marcaria como falhos uma hora
depois, e o coordenador teria de reprocessar cada um à mão.

O log é o que deixa ver quando os callbacks sem token pararam de chegar — o sinal de que a transição
acabou.

### ⚠️ Guarda por token, e não por status — é o que preserva o card 13

O card 14 pedia uma exceção: *"a guarda precisa aceitar callback tardio quando o `failed` tem o
código `leitura_nao_retornou`"*. Isso foi escrito supondo uma guarda **de status**.

Com guarda **de token**, a exceção é desnecessária, porque a varredura do card 13 **não aciona o OMR
e portanto não muda o `tentativaId`**:

| cenário | token do callback vs. do histórico | resultado |
|---|---|---|
| **Card 14** — o `arq` reentrega a tentativa 1 depois do reprocesso | T1 ≠ T2 | **descartado** ✅ |
| **Card 13** — a varredura marcou `failed`; o callback legítimo enfim chega | T1 = T1 | **aplicado** ✅ |

O mesmo mecanismo resolve os dois, sem tratar status em lugar nenhum. **A exceção por
`leitura_nao_retornou` será removida do card 14** como parte deste trabalho: um card que pede algo
desnecessário confunde quem o ler depois.

## 4. O token

`tentativaId`, campo novo e opcional no `Historico`, gerado com `randomUUID()` de `node:crypto` — sem
dependência nova.

Cunhado nos **dois** pontos que acionam o OMR (os únicos, verificados por busca):

| ponto | quando |
|---|---|
| `cartao-historico.service.ts:52` → `createAwaitingOmr` | primeira foto |
| `cartao-reprocesso.service.ts:86` → `reabrirParaOmr` | reprocessar e reenviar foto |

⚠️ O token tem de ser cunhado **e gravado antes** do POST ao ms-omr. Se fosse gravado depois, um
callback rápido chegaria antes da escrita e seria descartado por não bater com nada.

## 5. O lado Python

| arquivo | mudança |
|---|---|
| `app/routers/omr.py` | `ProcessIn` ganha `tentativaId: str \| None = None` |
| `app/queue.py` | `enfileirar(pool, image_key, tentativa_id=None)` → `enqueue_job(..., tentativa_id)` |
| `app/services/omr_pipeline.py` | `process_cartao(ctx, image_key, tentativa_id=None)` e o repasse aos dois `_entregar_*` |
| `app/services/callback.py` | `enviar_resultado_ok/falha(..., tentativa_id=None)` → o payload |

⚠️ **O default `= None` em `process_cartao` não é estilo — é obrigatório.** Os jobs já enfileirados no
Redis foram serializados com **um** argumento. Se a função passar a exigir dois posicionais, esses
jobs quebram ao ser executados, e os cartões correspondentes ficam presos em `awaiting_omr` até a
varredura do card 13.

⚠️ **A reentrega do `arq` carrega os argumentos originais**, então a tentativa 1 reentregue leva o
token T1 — que é exatamente o que faz a guarda funcionar.

## 6. Testes

**ms-simulado:**

1. Callback com `tentativaId` igual ao do histórico → aplica
2. ⚠️ Callback com `tentativaId` **diferente** → descarta, não escreve nada, loga (é o cenário do card)
3. Callback **sem** `tentativaId` → aplica, com log
4. Histórico **sem** `tentativaId` e callback **com** → aplica, com log
5. ⚠️ **O cenário completo do card:** falha na tentativa 1 → reprocesso cunha T2 → chega o callback de
   T1 → o histórico **continua** em `awaiting_omr`, sem voltar a `failed`
6. ⚠️ **O cenário do card 13:** varredura marcou `failed` com T1 intacto → chega o callback de T1 →
   **aplicado** (prova que a rede de segurança do 13 sobreviveu)
7. `createAwaitingOmr` grava um `tentativaId`, e dois acionamentos geram tokens diferentes
8. `reabrirParaOmr` troca o `tentativaId`
9. `OmrHttpService` manda o token no corpo

**ms-omr:**

10. `POST /omr/process` com `tentativaId` enfileira com ele
11. `POST /omr/process` **sem** `tentativaId` continua aceito (202)
12. O callback de sucesso e o de falha carregam o `tentativaId` recebido
13. ⚠️ `process_cartao(ctx, image_key)` com **um** argumento ainda funciona — o job velho do Redis

**Mutações que os testes precisam matar:** remover a comparação de token · inverter a comparação ·
descartar quando o token está ausente · não cunhar token no `reabrirParaOmr` · cunhar token fixo em
vez de `randomUUID` · não repassar o token no callback do Python · tirar o default de
`process_cartao`.

## 7. Deploy

**Lockstep `ms-omr` → `ms-simulado`.** Com o token opcional dos dois lados, qualquer ordem funciona —
mas nesta o token começa a chegar assim que o ms-simulado sobe, encurtando a janela em que a proteção
não vale.

Sem migração: o campo é opcional, e histórico antigo cai na quarta linha da tabela do §3.

## 8. Fora de escopo

- **O caminho `reenviar_foto`**, já coberto por cunhar `imageKey` nova.
- **Deduplicar callbacks no ms-omr** — o problema é o casamento com a tentativa, não a repetição.
- **Tornar o token obrigatório.** Fica para depois que os logs mostrarem que callback sem token não
  chega mais; não há pressa, e exigir cedo demais é justamente o risco do §3.

## 9. Critérios de aceite

- [ ] Callback cujo token não bate com a tentativa corrente é descartado, com log
- [ ] Callback da tentativa corrente é aplicado normalmente
- [ ] O token muda a cada acionamento do OMR
- [ ] Teste que simula a reentrega atrasada do cenário do §1
- [ ] Teste provando que a rede de segurança do card 13 sobreviveu
- [ ] Callback sem token é **aceito**, e um job serializado com um argumento ainda roda
- [ ] A exceção por `leitura_nao_retornou` removida do card 14
- [ ] Suítes, builds e lints limpos nos dois repos
