# Token de tentativa no callback do OMR — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descartar callback de uma tentativa que não é mais a corrente, sem quebrar nada durante o
deploy.

**Architecture:** Um `tentativaId` opcional viaja do ms-simulado ao ms-omr no `/omr/process` e volta
no callback. O ms-simulado compara com o token gravado no histórico e descarta o que não bate.
Opcional nas duas pontas, de propósito: é isso que faz sobreviver ao deploy e aos jobs já no Redis.

**Tech Stack:** NestJS 10 + Mongoose (ms-simulado), FastAPI + arq (ms-omr), Jest, pytest.

**Spec:** `ms-simulado/docs/superpowers/specs/2026-09-20-token-de-tentativa-design.md`
**Branches:** `feature/14-token-de-tentativa` nos **dois** repos.

⚠️ **Dois repos.** Tasks 1-2 no `ms-omr`, 3-6 no `ms-simulado`, 7 verifica os dois.
Caminhos: `/Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-omr` e `.../ms-simulado`.

---

## Como rodar os testes

| repo | comando |
|---|---|
| `ms-omr` | `.venv/bin/pytest tests/<arquivo> -q` (baseline: **67 testes**) |
| `ms-simulado` | `npx jest <caminho> --detectOpenHandles --forceExit` (baseline: **935 testes / 89 suítes**) |

⚠️ **Nunca** `npm run lint` / `yarn lint` no ms-simulado — reformatam o repo. Use `npx eslint <caminhos explícitos>`.

---

## Task 1 [ms-omr]: o token atravessa a fila e volta no callback

**Files (todos em `ms-omr`):**
- Modify: `app/routers/omr.py`, `app/queue.py`, `app/services/callback.py`, `app/services/omr_pipeline.py`
- Test: `tests/test_callback.py`, `tests/test_omr_router.py` (confira o nome real com `ls tests/`)

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_callback.py`, acrescente ao final (o arquivo já tem `FakeClient`/`FakeResp`; reuse):

```python
async def test_ok_leva_tentativa_id(monkeypatch):
    FakeClient.posted = []
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    await callback.enviar_resultado_ok("cartoes/1/a", [], tentativa_id="T1")
    _, body = FakeClient.posted[0]
    assert body["tentativaId"] == "T1"


async def test_falha_leva_tentativa_id(monkeypatch):
    FakeClient.posted = []
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    await callback.enviar_resultado_falha(
        "cartoes/1/a", CodigoFalha.ERRO_INTERNO, "x", tentativa_id="T1"
    )
    _, body = FakeClient.posted[0]
    assert body["tentativaId"] == "T1"


async def test_sem_tentativa_id_o_campo_vai_nulo(monkeypatch):
    # ⚠️ O ms-simulado ACEITA callback sem token (job enfileirado antes do
    # deploy). O campo ir como None e' o contrato: nao pode sumir do payload
    # nem virar string vazia, que o `@IsOptional` do outro lado trataria
    # diferente.
    FakeClient.posted = []
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    await callback.enviar_resultado_ok("cartoes/1/a", [])
    _, body = FakeClient.posted[0]
    assert body["tentativaId"] is None
```

Em `tests/test_omr_router.py` (existe, e usa `TestClient(app)` com `app.state.arq_pool = FakePool()`
— **não** fixtures `client`/`fake_pool`):

⚠️ **PRIMEIRO conserte o dublê, senão os testes que hoje passam quebram.** O `FakePool` do arquivo
declara `async def enqueue_job(self, func, image_key)` — **dois** parâmetros. Quando `enfileirar`
passar o token, essa assinatura estoura com `TypeError`, e o `_isolar_worker_e_pool` é `autouse`:
o estrago aparece em testes que nada têm a ver com este card.

```python
class FakePool:
    def __init__(self):
        self.jobs = []

    # ⚠️ `tentativa_id=None` com default: o enfileirar passa 3 argumentos agora,
    # e o default mantem legivel qualquer chamada antiga que sobre no arquivo.
    async def enqueue_job(self, func, image_key, tentativa_id=None):
        self.jobs.append((func, image_key, tentativa_id))
        return object()
```

⚠️ **Isso muda a forma das tuplas em `self.jobs`** — os testes existentes que asseram
`jobs[-1] == ("process_cartao", "...")` passam a precisar do terceiro item. Rode a suíte e ajuste os
que quebrarem: é mudança de dublê, não de comportamento.

Depois acrescente:

```python
def test_process_aceita_tentativa_id():
    app.state.arq_pool = FakePool()
    with TestClient(app) as c:
        r = c.post(
            "/omr/process",
            json={"imageKey": "cartoes/665/a.jpg", "tentativaId": "T1"},
        )
    assert r.status_code == 202
    assert app.state.arq_pool.jobs[-1] == ("process_cartao", "cartoes/665/a.jpg", "T1")


def test_process_sem_tentativa_id_continua_aceito():
    # ⚠️ Compatibilidade: o ms-simulado velho nao manda o campo, e recusar aqui
    # prenderia todo cartao do periodo em `awaiting_omr`.
    app.state.arq_pool = FakePool()
    with TestClient(app) as c:
        r = c.post("/omr/process", json={"imageKey": "cartoes/665/a.jpg"})
    assert r.status_code == 202
    assert app.state.arq_pool.jobs[-1][2] is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/ -q 2>&1 | tail -15`

Expected: falham os novos (`TypeError: ... unexpected keyword argument 'tentativa_id'` e o do router).

- [ ] **Step 3: Implementar**

`app/services/callback.py` — as duas funções e o `_post`:

```python
async def enviar_resultado_ok(
    image_key: str, respostas: list[dict], tentativa_id: str | None = None
) -> None:
    await _post(
        {"imageKey": image_key, "respostas": respostas, "tentativaId": tentativa_id}
    )


async def enviar_resultado_falha(
    image_key: str,
    motivo: str,
    detalhe: str | None = None,
    tentativa_id: str | None = None,
) -> None:
    await _post(
        {
            "imageKey": image_key,
            "falha": {"motivo": motivo, "detalhe": detalhe},
            "tentativaId": tentativa_id,
        }
    )
```

`app/queue.py`:

```python
async def enfileirar(pool, image_key: str, tentativa_id: str | None = None):
    return await pool.enqueue_job(_QUEUE_FUNC, image_key, tentativa_id)
```

`app/routers/omr.py`:

```python
class ProcessIn(BaseModel):
    imageKey: str
    tentativaId: str | None = None
```

e na função, troque a chamada por:

```python
    await enfileirar(pool, body.imageKey, body.tentativaId)
```

`app/services/omr_pipeline.py` — a assinatura e o repasse:

```python
async def process_cartao(ctx, image_key: str, tentativa_id: str | None = None) -> None:
```

⚠️ **O default `= None` não é estilo — é obrigatório.** Os jobs já enfileirados no Redis foram
serializados com **um** argumento; exigir dois posicionais os quebraria na execução, e os cartões
correspondentes ficariam presos em `awaiting_omr` até a varredura do card 13.

E os dois entregadores passam a levar o token adiante:

```python
async def _entregar_ok(
    ctx, image_key: str, respostas: list[dict], tentativa_id: str | None = None
) -> None:
    try:
        await callback.enviar_resultado_ok(image_key, respostas, tentativa_id)
    except Exception as exc:
        _retry_ou_desistir(ctx, image_key, exc)


async def _entregar_falha(
    ctx,
    image_key: str,
    motivo: CodigoFalha,
    detalhe: str | None,
    tentativa_id: str | None = None,
) -> None:
    try:
        await callback.enviar_resultado_falha(image_key, motivo, detalhe, tentativa_id)
    except Exception as exc:
        _retry_ou_desistir(ctx, image_key, exc)
```

⚠️ **Dentro de `process_cartao`, TODAS as chamadas a `_entregar_ok`/`_entregar_falha` precisam passar
`tentativa_id`.** Procure com `grep -n '_entregar_' app/services/omr_pipeline.py` e confira uma por
uma — uma chamada esquecida devolve callback sem token, que o ms-simulado aceita em silêncio, e o
defeito continua vivo sem ninguém notar.

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest tests/ -q 2>&1 | tail -5`

Expected: **todos**, baseline 67 + os novos.

- [ ] **Step 5: Commit**

```bash
git add app/routers/omr.py app/queue.py app/services/callback.py app/services/omr_pipeline.py tests/
git commit -m "feat: tentativaId opcional atravessa a fila e volta no callback"
```

---

## Task 2 [ms-omr]: o job antigo do Redis ainda roda

⚠️ **Task própria porque é o risco de deploy, não um detalhe.**

**Files:** `tests/test_omr_pipeline.py` (confira o nome com `ls tests/`)

- [ ] **Step 1: Escrever o teste**

```python
async def test_job_antigo_sem_tentativa_id_ainda_roda(monkeypatch):
    # ⚠️ Os jobs ja enfileirados no Redis no momento do deploy foram
    # serializados com UM argumento. Se `process_cartao` exigisse dois
    # posicionais, eles quebrariam ao executar e os cartoes ficariam presos em
    # `awaiting_omr` ate a varredura do card 13 — uma hora depois.
    import inspect
    from app.services.omr_pipeline import process_cartao

    sig = inspect.signature(process_cartao)
    assert sig.parameters["tentativa_id"].default is None
```

Se o arquivo de teste do pipeline já tiver um teste que invoca `process_cartao` com dublês,
**acrescente também** uma chamada com dois argumentos (`ctx, image_key`) provando que não estoura.
Siga o estilo que já estiver lá.

- [ ] **Step 2: Rodar**

Run: `.venv/bin/pytest tests/ -q 2>&1 | tail -5`

Expected: PASS (a Task 1 já implementou o default; este teste **trava** a propriedade).

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test: trava a compatibilidade do job serializado antes do deploy"
```

---

## Task 3 [ms-simulado]: o campo no schema e a cunhagem

**Files (todos em `ms-simulado`):**
- Modify: `src/modules/historico/historico.schema.ts`
- Modify: `src/modules/historico/historico.repository.ts`
- Test: `src/modules/historico/historico.repository.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `historico.repository.spec.ts`:

```ts
describe('tentativaId (card 14)', () => {
  it('createAwaitingOmr grava um tentativaId', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'h1' });
    const repo = new HistoricoRepository({ create } as any);

    await repo.createAwaitingOmr({
      usuario: 'u1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc1',
      imageKey: 'cartoes/665abc/i.jpg',
      cartaoCode: '7',
      tentativaId: 'T1',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tentativaId: 'T1' }),
    );
  });

  it('⚠️ reabrirParaOmr TROCA o tentativaId', async () => {
    // E' o que faz o callback da tentativa anterior deixar de bater. Sem isto,
    // o reprocesso continua aceitando o callback velho e o card nao conserta
    // nada.
    const exec = jest.fn().mockResolvedValue(undefined);
    const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ findByIdAndUpdate } as any);

    await repo.reabrirParaOmr('h1', { quando: new Date(), tentativaId: 'T2' });

    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set.tentativaId).toBe('T2');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/modules/historico/historico.repository.spec.ts --detectOpenHandles --forceExit`

Expected: FALHA (erro de tipo: a propriedade não existe nas assinaturas).

- [ ] **Step 3: Implementar**

Em `src/modules/historico/historico.schema.ts`, junto de `ultimaTentativaEm`:

```ts
  /**
   * Identifica o acionamento do OMR que está em voo.
   *
   * ⚠️ Muda a cada acionamento, e é o que permite descartar o callback de uma
   * tentativa que não é mais a corrente: no caminho `reprocessar` a `imageKey`
   * é reusada de propósito (a foto não mudou), então ela não distingue as
   * tentativas — e o `arq` do ms-omr reentrega até três vezes.
   *
   * ⚠️ **Opcional.** Histórico criado antes deste card não tem, e o callback
   * correspondente precisa continuar sendo aceito.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public tentativaId?: string;
```

Em `historico.repository.ts`, `createAwaitingOmr` ganha o campo no tipo do parâmetro e no `create`:

```ts
  async createAwaitingOmr(data: {
    usuario: string;
    simuladoId: string;
    imageKey: string;
    cartaoCode: string;
    tentativaId: string;
  }): Promise<Historico> {
    return this.model.create({
      usuario: data.usuario,
      simulado: new Types.ObjectId(data.simuladoId),
      imageKey: data.imageKey,
      cartaoCode: data.cartaoCode,
      tentativaId: data.tentativaId,
      status: HistoricoStatus.AwaitingOmr,
    });
  }
```

e `reabrirParaOmr` passa a receber e gravar o token:

```ts
  async reabrirParaOmr(
    id: string,
    dados: { imageKey?: string; quando: Date; tentativaId: string },
  ): Promise<void> {
    const set: Record<string, unknown> = {
      status: HistoricoStatus.AwaitingOmr,
      ultimaTentativaEm: dados.quando,
      tentativaId: dados.tentativaId,
    };
    if (dados.imageKey !== undefined) {
      set.imageKey = dados.imageKey;
    }

    await this.model
      .findByIdAndUpdate(id, { $set: set, $unset: { falha: '' } })
      .exec();
  }
```

- [ ] **Step 4: Rodar**

Run: `npx jest src/modules/historico --detectOpenHandles --forceExit`

Expected: PASS. ⚠️ O TypeScript vai apontar os chamadores que ainda não passam `tentativaId` — são a
Task 4. Se os testes de OUTROS arquivos quebrarem por isso, siga para a Task 4 e volte.

- [ ] **Step 5: Commit**

```bash
git add src/modules/historico/historico.schema.ts src/modules/historico/historico.repository.ts src/modules/historico/historico.repository.spec.ts
git commit -m "feat: historico guarda o token da tentativa em voo"
```

---

## Task 4 [ms-simulado]: cunhar o token nos dois acionamentos

**Files:**
- Modify: `src/modules/cartao-resposta/cartao-historico.service.ts`
- Modify: `src/modules/cartao-resposta/cartao-reprocesso.service.ts`
- Modify: `src/modules/cartao-resposta/omr-http.service.ts`
- Test: os `.spec.ts` correspondentes dos três

- [ ] **Step 1: Escrever os testes que falham**

Em `omr-http.service.spec.ts`:

```ts
  it('⚠️ manda o tentativaId no corpo', async () => {
    // Sem isto o token nunca sai daqui, o ms-omr devolve `null`, e a guarda do
    // callback aceita tudo — o card inteiro vira no-op silencioso.
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 202 } as any);
    global.fetch = fetchMock as any;
    const svc = new OmrHttpService({ get: () => 'http://omr' } as any);

    await svc.enviarProcessamento('cartoes/1/a.jpg', 'T1');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ imageKey: 'cartoes/1/a.jpg', tentativaId: 'T1' });
  });
```

⚠️ Confira como o spec existente monta o `OmrHttpService` e o dublê de `fetch`, e **siga aquele
padrão** em vez do esboço acima se forem diferentes.

Em `cartao-historico.service.spec.ts` e `cartao-reprocesso.service.spec.ts`, acrescente um teste em
cada:

```ts
  it('⚠️ cunha um token NOVO e o grava ANTES de acionar o OMR', async () => {
    // A ordem importa: se o token fosse gravado depois do POST, um callback
    // rapido chegaria antes da escrita e seria descartado por nao bater com
    // nada.
    // (monte com os dubles que este arquivo ja usa e assere que o
    // `tentativaId` passado ao repositorio e' o MESMO passado ao omrHttp)
  });
```

⚠️ **Escreva o corpo real** usando os dublês do arquivo; o comentário acima diz o que provar. Nos dois
casos, asserte que o token do repositório e o do `enviarProcessamento` são **o mesmo valor**, e que
dois acionamentos seguidos produzem valores **diferentes**.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/modules/cartao-resposta --detectOpenHandles --forceExit`

- [ ] **Step 3: Implementar**

`omr-http.service.ts`:

```ts
  async enviarProcessamento(
    imageKey: string,
    tentativaId?: string,
  ): Promise<void> {
    const url = `${this.env.get('OMR_URL')}/omr/process`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageKey, tentativaId }),
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`ms-omr respondeu ${resp.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
```

Nos dois serviços, importe `randomUUID` de `node:crypto` e cunhe o token **antes** de gravar:

```ts
import { randomUUID } from 'node:crypto';
```

Em `cartao-historico.service.ts`, perto da linha 39, gere `const tentativaId = randomUUID();`, passe-o
a `createAwaitingOmr({ ..., tentativaId })` e depois a
`this.omrHttp.enviarProcessamento(dto.imageKey, tentativaId)`.

Em `cartao-reprocesso.service.ts`, perto da linha 80, gere `const tentativaId = randomUUID();`,
passe-o a `reabrirParaOmr(params.historicoId, { ..., tentativaId })` e depois a
`this.omrHttp.enviarProcessamento(params.imageKey ?? historico.imageKey, tentativaId)`.

⚠️ **Nos dois: cunhar e GRAVAR antes do POST.** Ver o comentário do teste.

- [ ] **Step 4: Rodar**

Run: `npx jest src/modules/cartao-resposta --detectOpenHandles --forceExit`

- [ ] **Step 5: Commit**

```bash
git add src/modules/cartao-resposta/cartao-historico.service.ts src/modules/cartao-resposta/cartao-reprocesso.service.ts src/modules/cartao-resposta/omr-http.service.ts src/modules/cartao-resposta/*.spec.ts
git commit -m "feat: cunha token novo a cada acionamento do OMR"
```

---

## Task 5 [ms-simulado]: a guarda no callback — o coração do card

**Files:**
- Modify: `src/modules/cartao-resposta/dtos/cartao-callback.dto.input.ts`
- Modify: `src/modules/cartao-resposta/cartao-callback.service.ts`
- Test: `src/modules/cartao-resposta/cartao-callback.service.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `cartao-callback.service.spec.ts`, usando os dublês que o arquivo já monta:

```ts
describe('guarda por tentativaId (card 14)', () => {
  it('token que bate: aplica normalmente', async () => {
    // historico com tentativaId 'T1', callback com 'T1' → escreve
  });

  it('⚠️ token que NAO bate: descarta e nao escreve NADA', async () => {
    // historico com 'T2' (ja reprocessado), callback com 'T1' (reentrega do
    // arq) → nenhuma escrita, e um log.
  });

  it('⚠️ callback SEM token: aplica, com log', async () => {
    // ms-omr ainda velho, ou job enfileirado antes do deploy. Recusar aqui
    // prenderia TODO cartao do periodo em awaiting_omr.
  });

  it('⚠️ historico SEM token: aplica, com log', async () => {
    // documento criado antes deste card
  });

  it('⚠️ O CENARIO DO CARD, ponta a ponta', async () => {
    // 1. tentativa 1 falha (callback T1 marca failed)
    // 2. reprocesso cunha T2 e volta para awaiting_omr
    // 3. o arq reentrega a tentativa 1: chega callback T1 com falha
    // → o historico NAO pode voltar a failed: `marcarFalha` nao e' chamado
  });

  it('⚠️ O CENARIO DO CARD 13: a rede de seguranca sobrevive', async () => {
    // A varredura marcou `failed`/`leitura_nao_retornou` mas NAO aciona o OMR,
    // entao o tentativaId continua T1. O callback legitimo de T1 chega depois
    // → APLICADO. Se este teste quebrar, o card 13 perdeu a auto-correcao que
    // torna a janela de 1h aceitavel.
  });
});
```

⚠️ **Escreva os corpos reais** com os dublês do arquivo. Os comentários dizem exatamente o que cada um
prova. Os dois últimos são os que justificam o card existir — não os deixe superficiais.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/modules/cartao-resposta/cartao-callback.service.spec.ts --detectOpenHandles --forceExit`

- [ ] **Step 3: Implementar**

No DTO, acrescente o campo:

```ts
  /**
   * ⚠️ **Opcional de propósito.** O ms-omr pode ainda não mandá-lo (deploy em
   * andamento), e há jobs enfileirados no Redis de antes da mudança. Exigir
   * aqui faria o `ValidationPipe` recusar o callback inteiro, e todo cartão do
   * período ficaria preso em `awaiting_omr`.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tentativaId?: string;
```

Na interface `CartaoCallbackInput` do serviço, acrescente `tentativaId?: string;`.

E em `processar`, **logo depois** do `if (!historico)` e **antes** do `if (input.falha)`:

```ts
    const tokenDoHistorico = (historico as { tentativaId?: string })
      .tentativaId;

    // ⚠️ A guarda é por TOKEN, e não por status — e essa escolha é o que
    // preserva a varredura do card 13. Ela marca `failed` sem acionar o OMR,
    // logo NÃO muda o `tentativaId`: o callback legítimo que chegue depois
    // ainda bate e é aplicado, desfazendo o falso positivo. Uma guarda de
    // status recusaria exatamente esse callback, e o cartão ficaria errado
    // para sempre.
    if (
      tokenDoHistorico !== undefined &&
      input.tentativaId !== undefined &&
      input.tentativaId !== tokenDoHistorico
    ) {
      this.logger.warn(
        `callback de tentativa antiga descartado para ${input.imageKey}: ` +
          `recebido ${input.tentativaId}, corrente ${tokenDoHistorico}`,
      );
      return;
    }

    // ⚠️ Token ausente de um lado ou do outro NÃO descarta, e isto é o que faz
    // o deploy sobreviver: ms-omr ainda velho, job enfileirado antes da
    // mudança, ou histórico criado antes deste card. O log é o sinal de quando
    // a transição terminou — quando ele parar de aparecer, o token pode virar
    // obrigatório.
    if (tokenDoHistorico === undefined || input.tentativaId === undefined) {
      this.logger.log(
        `callback sem token para ${input.imageKey} ` +
          `(histórico: ${tokenDoHistorico ?? 'ausente'}, callback: ${input.tentativaId ?? 'ausente'}) — aceito`,
      );
    }
```

- [ ] **Step 4: Rodar**

Run: `npx jest src/modules/cartao-resposta --detectOpenHandles --forceExit`

- [ ] **Step 5: Commit**

```bash
git add src/modules/cartao-resposta/dtos/cartao-callback.dto.input.ts src/modules/cartao-resposta/cartao-callback.service.ts src/modules/cartao-resposta/cartao-callback.service.spec.ts
git commit -m "fix: callback de tentativa antiga nao sobrescreve a corrente"
```

---

## Task 6 [ms-simulado]: o controller — JÁ VERIFICADO, nada a fazer

✅ **Medido antes de escrever este plano:** `cartao-resposta.controller.ts:51` faz
`await this.cartaoCallback.processar(dto)` — repassa o **DTO inteiro**. O campo novo chega ao serviço
sozinho assim que entra no DTO (Task 5).

**Não há nada a implementar aqui.** A task existe para registrar que a verificação foi feita: se o
controller montasse o objeto campo a campo, o token morreria nele e o card viraria no-op silencioso.

## Task 7: verificação dos dois repos

- [ ] **Step 1: ms-omr**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-omr
.venv/bin/pytest tests/ -q 2>&1 | tail -5
```

Expected: verde. Baseline 67 + os novos.

- [ ] **Step 2: ms-simulado**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-simulado
npx jest --detectOpenHandles --forceExit 2>&1 | tail -6
npm run build
ls dist/main.js
npx eslint src/modules/cartao-resposta src/modules/historico
```

Expected: suíte verde (baseline **935 / 89** + os novos), build OK, **`dist/main.js` presente**, lint
limpo. ⚠️ Se `dist/main.js` sumir, algum `.ts` foi parar fora de `src/` e o `rootDir` mudou — quebra o
PM2 em produção com `Script not found /var/www/main.js`.

- [ ] **Step 3: Mutações (obrigatório)**

Uma por vez, rodar, confirmar VERMELHO, **reverter**:

| # | Mutação | Repo | Tem de matar |
|---|---|---|---|
| 1 | Remover o `if` da guarda inteiro | ms-simulado | o teste do token que não bate |
| 2 | Trocar `!==` por `===` na comparação | ms-simulado | idem |
| 3 | Descartar quando o token está ausente (tirar as duas checagens de `undefined`) | ms-simulado | os testes de "sem token" e o do card 13 |
| 4 | `reabrirParaOmr` não gravar `tentativaId` | ms-simulado | o teste do reabrir, e o cenário do card |
| 5 | Cunhar `'fixo'` em vez de `randomUUID()` | ms-simulado | o teste de que dois acionamentos diferem |
| 6 | `enviarProcessamento` não mandar o token | ms-simulado | o teste do corpo do POST |
| 7 | `callback.py` não repassar `tentativa_id` | ms-omr | os testes de payload |
| 8 | Tirar o default de `process_cartao` | ms-omr | o teste do job antigo |

⚠️ Se alguma ficar VERDE, o teste é decorativo — reescreva e **diga qual no relatório**.

---

## Critérios de aceite (do spec §9)

- [ ] Callback cujo token não bate é descartado, com log
- [ ] Callback da tentativa corrente é aplicado
- [ ] O token muda a cada acionamento
- [ ] Teste da reentrega atrasada (cenário do card)
- [ ] Teste provando que a rede de segurança do card 13 sobreviveu
- [ ] Callback sem token é **aceito**; job serializado com um argumento ainda roda
- [ ] Suítes, builds e lints limpos nos dois repos
