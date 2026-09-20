# Varredura de `awaiting_omr` preso — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Devolver ao fluxo acionável todo cartão preso em `awaiting_omr` há mais de uma hora,
marcando-o como `failed` com um código que mapeia para `Reprocessar`.

**Architecture:** Um método de consulta no `HistoricoRepository` (com `$or` para cobrir documento sem
`ultimaTentativaEm`), um código de falha novo mapeado para `Reprocessar`, e um serviço com `@Cron` no
módulo `cartao-resposta`. Reusa `marcarFalha`, que já existe.

**Tech Stack:** NestJS 10, Mongoose, `@nestjs/schedule`, Jest.

**Spec:** `docs/superpowers/specs/2026-09-20-varredura-awaiting-omr-design.md`
**Branch:** `feature/13-varredura-awaiting-omr` (já criada, spec já commitado)

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/modules/historico/falha/codigo-falha.ts` | O código novo no enum | Modificar |
| `src/modules/historico/falha/mapa-falha.ts` | Descrição + `Reprocessar` | Modificar |
| `src/modules/historico/falha/mapa-falha.spec.ts` | Prova o mapeamento | Modificar (existe?) ou criar |
| `src/modules/historico/historico.repository.ts` | `findAwaitingOmrAntigos` | Modificar |
| `src/modules/historico/historico.repository.spec.ts` | Prova a query dos dois ramos | Modificar |
| `src/modules/cartao-resposta/cartao-varredura.service.ts` | O `@Cron` e a regra | Criar |
| `src/modules/cartao-resposta/cartao-varredura.service.spec.ts` | Prova a regra | Criar |
| `src/modules/cartao-resposta/cartao-resposta.module.ts` | Registra o provider | Modificar |

---

## Task 1: O código de falha e o mapeamento

⚠️ **Primeiro, porque tudo depende dele.** Se o código não mapear para `Reprocessar`, a varredura
troca "preso em processando" por "falha que ninguém pode resolver" — o que não é progresso.

**Files:**
- Modify: `src/modules/historico/falha/codigo-falha.ts`
- Modify: `src/modules/historico/falha/mapa-falha.ts`
- Test: `src/modules/historico/falha/mapa-falha.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Primeiro rode `ls src/modules/historico/falha/` para ver se `mapa-falha.spec.ts` já existe.

**Se existir**, acrescente estes dois testes no describe principal. **Se não existir**, crie o arquivo
com este conteúdo completo:

```ts
import { AcaoSugerida, CodigoFalhaInterno } from './codigo-falha';
import { descreverFalha } from './mapa-falha';

describe('mapa-falha — leitura_nao_retornou (card 13)', () => {
  it('⚠️ mapeia para Reprocessar, NAO para FalarComSuporte', () => {
    // A foto esta boa: quem falhou foi a infraestrutura, e o coordenador
    // resolve sozinho apertando "tentar de novo". Com `FalarComSuporte` a
    // varredura trocaria "preso em processando" por "falha sem saida", que
    // nao e progresso — e a acao do card 09 nem apareceria na tela.
    const d = descreverFalha({
      codigo: CodigoFalhaInterno.LeituraNaoRetornou,
    } as any);

    expect(d?.acaoSugerida).toBe(AcaoSugerida.Reprocessar);
  });

  it('tem descricao propria, e nao cai no fallback', () => {
    const d = descreverFalha({
      codigo: CodigoFalhaInterno.LeituraNaoRetornou,
    } as any);

    expect(d?.descricao).toContain('não retornou');
    expect(d?.descricao).not.toBe('Não foi possível ler o cartão.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/modules/historico/falha/mapa-falha.spec.ts --detectOpenHandles --forceExit`

Expected: FALHA — `LeituraNaoRetornou` não existe no enum (erro de compilação TS2339).

- [ ] **Step 3: Implementar**

Em `src/modules/historico/falha/codigo-falha.ts`, acrescente ao final do enum
`CodigoFalhaInterno`:

```ts
  /**
   * ⚠️ Produzido pela VARREDURA (card 13), não por uma falha observada.
   *
   * Significa "o ms-omr aceitou a requisição e o callback nunca chegou". As
   * duas saídas que produzem isto estão nomeadas em
   * `ms-omr/app/services/omr_pipeline.py:100-119`: o `job_timeout` do arq
   * (que chega como `CancelledError`, um `BaseException` não capturável) e o
   * POST do callback falhando nas três tentativas.
   */
  LeituraNaoRetornou = 'leitura_nao_retornou',
```

Em `src/modules/historico/falha/mapa-falha.ts`, acrescente ao `MAPA`, junto das outras entradas de
`CodigoFalhaInterno`:

```ts
  [CodigoFalhaInterno.LeituraNaoRetornou]: {
    descricao:
      'A leitura do cartão não retornou a tempo. Tente processar novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/modules/historico/falha --detectOpenHandles --forceExit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/historico/falha/
git commit -m "feat: codigo de falha para leitura que nao retornou"
```

---

## Task 2: A consulta dos presos

**Files:**
- Modify: `src/modules/historico/historico.repository.ts`
- Test: `src/modules/historico/historico.repository.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

O arquivo já existe e usa dublês simples (`{ findOne }`, `{ find }` etc. passados ao construtor).
Acrescente no final do arquivo:

```ts
describe('HistoricoRepository.findAwaitingOmrAntigos (card 13)', () => {
  const CORTE = new Date('2026-09-20T10:00:00Z');

  const montar = () => {
    const exec = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ find } as any);
    return { repo, find };
  };

  it('filtra por status awaiting_omr', async () => {
    const { repo, find } = montar();
    await repo.findAwaitingOmrAntigos(CORTE);
    expect(find.mock.calls[0][0]).toMatchObject({ status: 'awaiting_omr' });
  });

  it('⚠️ o primeiro ramo usa ultimaTentativaEm — respeita o reprocesso', async () => {
    // Cartao criado ha 3 dias mas REENVIADO ha 1 minuto esta esperando ha 1
    // minuto, nao ha 3 dias. Sem este ramo a varredura mataria toda tentativa
    // de reprocessamento de um cartao antigo, no instante seguinte ao clique.
    const { repo, find } = montar();
    await repo.findAwaitingOmrAntigos(CORTE);

    const filtro = find.mock.calls[0][0];
    expect(filtro.$or[0]).toEqual({ ultimaTentativaEm: { $lt: CORTE } });
  });

  it('⚠️ o segundo ramo usa o _id para quem nao tem ultimaTentativaEm', async () => {
    // `createAwaitingOmr` NAO grava `ultimaTentativaEm` — so o `reabrirParaOmr`
    // grava. Sem este ramo, o cartao de primeira viagem (que e a maioria, e sao
    // justamente os presos hoje) jamais seria varrido. O ObjectId do Mongo
    // embute o timestamp de criacao, o que evita migracao.
    const { repo, find } = montar();
    await repo.findAwaitingOmrAntigos(CORTE);

    const ramo = find.mock.calls[0][0].$or[1];
    expect(ramo.ultimaTentativaEm).toEqual({ $exists: false });
    expect(ramo._id.$lt).toBeDefined();
    // o ObjectId de corte tem de representar o MESMO instante
    expect(ramo._id.$lt.getTimestamp().getTime()).toBe(CORTE.getTime());
  });

  it('devolve o que o find retornou', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'h1' }]);
    const find = jest.fn().mockReturnValue({ exec });
    const repo = new HistoricoRepository({ find } as any);

    const r = await repo.findAwaitingOmrAntigos(CORTE);

    expect(r).toEqual([{ _id: 'h1' }]);
  });
});
```

⚠️ Confira o topo do arquivo: se `HistoricoRepository` já estiver importado, não duplique o import.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/modules/historico/historico.repository.spec.ts --detectOpenHandles --forceExit`

Expected: FALHA — `findAwaitingOmrAntigos` não existe.

- [ ] **Step 3: Implementar**

Em `src/modules/historico/historico.repository.ts`, acrescente o método (perto de
`findByStatuses`, que é o vizinho temático):

```ts
  /**
   * Históricos parados em `awaiting_omr` desde antes de `corte`.
   *
   * ⚠️ **O `$or` não é enfeite — cada ramo cobre um caso que o outro não
   * alcança**, e isto vem de dois fatos medidos:
   *
   * 1. Este schema é `@Schema({ timestamps: false })`: **não há `createdAt`**.
   * 2. `createAwaitingOmr` não grava `ultimaTentativaEm`; só o
   *    `reabrirParaOmr` (card 09) grava.
   *
   * O primeiro ramo respeita o reprocesso: um cartão criado há três dias mas
   * reenviado há um minuto está esperando há um minuto, e não pode ser varrido.
   *
   * O segundo alcança quem nunca foi reprocessado — a maioria, e justamente os
   * que já estão presos hoje — pelo timestamp que o ObjectId do Mongo embute.
   * **Sem migração**, que é o ponto: são esses documentos que motivaram o card.
   */
  async findAwaitingOmrAntigos(corte: Date): Promise<Historico[]> {
    return this.model
      .find({
        status: HistoricoStatus.AwaitingOmr,
        $or: [
          { ultimaTentativaEm: { $lt: corte } },
          {
            ultimaTentativaEm: { $exists: false },
            _id: {
              $lt: Types.ObjectId.createFromTime(
                Math.floor(corte.getTime() / 1000),
              ),
            },
          },
        ],
      })
      .exec();
  }
```

⚠️ `Types` e `HistoricoStatus` já são importados neste arquivo (`createAwaitingOmr` usa os dois).
Confirme antes de acrescentar import.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/modules/historico/historico.repository.spec.ts --detectOpenHandles --forceExit`

Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/historico/historico.repository.ts src/modules/historico/historico.repository.spec.ts
git commit -m "feat: consulta de awaiting_omr parados, com fallback no _id"
```

---

## Task 3: O serviço com o `@Cron`

**Files:**
- Create: `src/modules/cartao-resposta/cartao-varredura.service.ts`
- Create: `src/modules/cartao-resposta/cartao-varredura.service.spec.ts`
- Modify: `src/modules/cartao-resposta/cartao-resposta.module.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/modules/cartao-resposta/cartao-varredura.service.spec.ts`:

```ts
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import {
  CartaoVarreduraService,
  JANELA_MINUTOS,
} from './cartao-varredura.service';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';

const AGORA = new Date('2026-09-20T12:00:00Z');

const montar = (presos: any[] = []) => {
  const historicoRepository = {
    findAwaitingOmrAntigos: jest.fn().mockResolvedValue(presos),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new CartaoVarreduraService(historicoRepository as any);
  return { svc, historicoRepository };
};

describe('CartaoVarreduraService', () => {
  it('⚠️ a janela e de 60 minutos, e o corte sai dela', async () => {
    // MEDIDO: o pior caso de PROCESSAMENTO do ms-omr e 630s (job_timeout 180s
    // x 3 tentativas + backoff 30s e 60s). Mas `omr_max_workers` e
    // `cpu_count()-1` e a VPS tem 1 vCPU: um worker, em serie. Numa turma de
    // 50 cartoes o ultimo espera a fila inteira ANTES de comecar. Uma janela
    // curta mataria cartao que ia terminar, e a varredura viraria a causa do
    // problema que deveria resolver.
    const { svc, historicoRepository } = montar();

    await svc.varrer(AGORA);

    expect(JANELA_MINUTOS).toBe(60);
    const corte = historicoRepository.findAwaitingOmrAntigos.mock.calls[0][0];
    expect(corte).toEqual(new Date('2026-09-20T11:00:00Z'));
  });

  it('marca cada preso como falho com leitura_nao_retornou', async () => {
    const { svc, historicoRepository } = montar([
      { _id: 'h1' },
      { _id: 'h2' },
    ]);

    await svc.varrer(AGORA);

    expect(historicoRepository.marcarFalha).toHaveBeenCalledTimes(2);
    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      CodigoFalhaInterno.LeituraNaoRetornou,
      expect.any(String),
    );
  });

  it('sem nada preso, nao escreve nada', async () => {
    const { svc, historicoRepository } = montar([]);

    await svc.varrer(AGORA);

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
  });

  it('⚠️ um preso que falha ao ser marcado nao derruba os outros', async () => {
    // A varredura roda sozinha, sem ninguem olhando. Se o primeiro documento
    // estourar e a excecao subir, os demais ficam presos ate a proxima volta —
    // ou para sempre, se o erro for deterministico.
    const { svc, historicoRepository } = montar([{ _id: 'h1' }, { _id: 'h2' }]);
    historicoRepository.marcarFalha
      .mockRejectedValueOnce(new Error('mongo caiu'))
      .mockResolvedValueOnce(undefined);

    await expect(svc.varrer(AGORA)).resolves.toBeUndefined();

    expect(historicoRepository.marcarFalha).toHaveBeenCalledTimes(2);
  });

  it('⚠️ o metodo agendado e DESCOBERTO pelo @Cron', () => {
    // Sem este teste, um erro no decorator faz o card falhar EM SILENCIO —
    // o pior desfecho possivel para um conserto que existe justamente para
    // acabar com o silencio de um cartao preso.
    const meta = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      CartaoVarreduraService.prototype.varrerAgendado,
    );

    expect(meta).toBeDefined();
  });
});
```

⚠️ **Se o import de `SCHEDULE_CRON_OPTIONS` não resolver** (o caminho `dist/` é interno e pode mudar
entre versões do `@nestjs/schedule`), NÃO invente outro caminho: rode
`ls node_modules/@nestjs/schedule/dist/*.d.ts` e
`grep -rn "SCHEDULE_CRON_OPTIONS" node_modules/@nestjs/schedule/dist/schedule.constants.d.ts` para
achar o nome real. Se mesmo assim não houver constante pública, troque este teste por um que use
`SchedulerRegistry` numa `Test.createTestingModule` com `ScheduleModule.forRoot()` e assere que o job
foi registrado. **Relate o que você fez.**

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/modules/cartao-resposta/cartao-varredura.service.spec.ts --detectOpenHandles --forceExit`

Expected: FALHA — o módulo não existe.

- [ ] **Step 3: Implementar**

Crie `src/modules/cartao-resposta/cartao-varredura.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';

/**
 * Quanto tempo um cartão pode ficar em `awaiting_omr` antes de ser considerado
 * perdido.
 *
 * ⚠️ **60 minutos, e não os ~15 que o pior caso de processamento sugeriria.**
 * MEDIDO no ms-omr: `job_timeout` 180s × `max_tries` 3 + backoff de 30s e 60s
 * = 630s (10,5 min). Mas o processamento não é o que domina:
 * `omr_max_workers = cpu_count() - 1` e a VPS tem **1 vCPU**, ou seja **um
 * worker, em série**. Numa turma que sobe 50 cartões, o último espera 49
 * leituras na fila antes de começar.
 *
 * Uma janela curta mataria cartão que ia terminar — e a varredura viraria a
 * causa do problema que deveria resolver.
 */
export const JANELA_MINUTOS = 60;

@Injectable()
export class CartaoVarreduraService {
  private readonly logger = new Logger(CartaoVarreduraService.name);

  constructor(private readonly historicoRepository: HistoricoRepository) {}

  /**
   * ⚠️ **Periódico, não só na subida.** O `recoverPending()` do
   * `AnswerProcessorService` roda no boot e cobre apenas `Pending` e
   * `Processing`; um processo pode não reiniciar por dias.
   *
   * ⚠️ **Seguro sob múltiplas instâncias**, e isto é design e não sorte: a
   * consulta filtra por `status: awaiting_omr`, então uma segunda instância
   * concorrente não encontra mais nada, e remarcar um `failed` como `failed`
   * com o mesmo motivo não altera o documento.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async varrerAgendado(): Promise<void> {
    await this.varrer(new Date());
  }

  /** `agora` é parâmetro para o teste não depender do relógio. */
  async varrer(agora: Date): Promise<void> {
    const corte = new Date(agora.getTime() - JANELA_MINUTOS * 60_000);
    const presos = await this.historicoRepository.findAwaitingOmrAntigos(corte);

    if (presos.length === 0) return;

    this.logger.warn(
      `${presos.length} cartão(ões) parado(s) em awaiting_omr há mais de ${JANELA_MINUTOS} min`,
    );

    for (const preso of presos) {
      const id = (preso as any)._id.toString();
      try {
        await this.historicoRepository.marcarFalha(
          id,
          CodigoFalhaInterno.LeituraNaoRetornou,
          `sem callback do OMR após ${JANELA_MINUTOS} minutos`,
        );
      } catch (err) {
        // ⚠️ Um documento que estoura não pode levar os outros junto: isto roda
        // sozinho, e se a exceção subir os demais ficam presos até a próxima
        // volta — ou para sempre, se o erro for determinístico.
        this.logger.error(
          `falha ao marcar ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
```

Em `src/modules/cartao-resposta/cartao-resposta.module.ts`, acrescente o import e o provider:

```ts
import { CartaoVarreduraService } from './cartao-varredura.service';
```

e dentro de `providers: [...]`, ao final da lista:

```ts
    CartaoVarreduraService,
```

⚠️ **Não** acrescente `ScheduleModule.forRoot()` aqui. Ele já existe em `content.module.ts:32`, e
`forRoot()` duas vezes registra o scheduler duas vezes — que é exatamente o defeito do card 17, que
acabamos de consertar no `main.ts`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/modules/cartao-resposta/cartao-varredura.service.spec.ts --detectOpenHandles --forceExit`

Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/cartao-resposta/cartao-varredura.service.ts src/modules/cartao-resposta/cartao-varredura.service.spec.ts src/modules/cartao-resposta/cartao-resposta.module.ts
git commit -m "feat: varredura periodica de cartao preso em awaiting_omr"
```

---

## Task 4: Verificação

- [ ] **Step 1: Suíte inteira**

Run: `npx jest --detectOpenHandles --forceExit 2>&1 | tail -6`

Expected: tudo verde. A baseline antes deste trabalho era **924 testes / 88 suítes**.

- [ ] **Step 2: Build e lint**

```bash
npm run build
npx eslint src/modules/cartao-resposta/cartao-varredura.service.ts src/modules/cartao-resposta/cartao-varredura.service.spec.ts src/modules/cartao-resposta/cartao-resposta.module.ts src/modules/historico/historico.repository.ts src/modules/historico/historico.repository.spec.ts src/modules/historico/falha/
```

⚠️ **NÃO rode `npm run lint` nem `yarn lint`** — reformatam o repo inteiro.
Se o eslint acusar formatação, rode `npx eslint --fix` **nos mesmos caminhos explícitos**.

⚠️ Depois do build, confirme `ls dist/main.js`. Se sumir, algum `.ts` foi parar fora de `src/` e o
`rootDir` mudou — isso quebra o PM2 em produção com `Script not found /var/www/main.js`.

- [ ] **Step 3: Mutações (obrigatório)**

Aplique uma por vez, rode o spec indicado, confirme VERMELHO e **reverta**:

| # | Mutação | Arquivo | Tem de matar |
|---|---|---|---|
| 1 | `$lt` → `$gt` no primeiro ramo | `historico.repository.ts` | o teste do ramo `ultimaTentativaEm` |
| 2 | Remover o segundo ramo do `$or` | `historico.repository.ts` | o teste do ramo `_id` |
| 3 | Remover `status` do filtro | `historico.repository.ts` | o teste do filtro por status |
| 4 | `Reprocessar` → `FalarComSuporte` | `mapa-falha.ts` | o teste do mapeamento |
| 5 | `JANELA_MINUTOS = 10` | `cartao-varredura.service.ts` | o teste da janela |
| 6 | Remover o `@Cron` | `cartao-varredura.service.ts` | o teste de descoberta |
| 7 | Tirar o `try/catch` do laço | `cartao-varredura.service.ts` | o teste do preso que estoura |

⚠️ Se alguma ficar VERDE, o teste é decorativo — reescreva antes de seguir e **diga qual no
relatório**.

- [ ] **Step 4: Commit se houve conserto**

```bash
git add <caminhos explícitos>
git commit -m "test: <o que foi reforcado>"
```

---

## Critérios de aceite (do spec §9)

- [ ] `awaiting_omr` mais velho que 1 hora vira `failed` com `leitura_nao_retornou`
- [ ] A janela é maior que o pior caso do OMR (630s) e com folga para a fila de um worker só
- [ ] O código novo mapeia para `Reprocessar`
- [ ] A varredura não toca em `awaiting_omr` recente — nem pelo `ultimaTentativaEm`, nem pelo `_id`
- [ ] Roda periodicamente, e há teste de que o `@Cron` é descoberto
- [ ] Suíte, build e lint limpos
