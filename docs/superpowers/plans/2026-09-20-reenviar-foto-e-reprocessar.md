# Reenviar foto e reprocessar — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O coordenador abre o detalhe de um estudante cujo cartão falhou e, quando a falha for do tipo que ele consegue resolver, manda uma foto nova ou pede nova tentativa — sem criar um segundo histórico e sem o OMR ler a foto velha.

**Architecture:** Uma rota nova no ms que reabre o histórico numa escrita só (status + `$unset` da falha + chave nova), gateada pela junção do cursinho; uma rota na api que decodifica o QR, cunha um `imageKey` novo e grava bucket → cache → ms; e um ramo no modal do card `07` que decide o que oferecer pelo `acaoSugerida` que o card `01` já entrega.

**Tech Stack:** NestJS 10 + Mongoose (ms), NestJS 10 + Multer + Redis (api), React 19 + Vite (client), Jest, Vitest, `mongodb-memory-server`, supertest.

**Spec:** `docs/superpowers/specs/2026-09-20-reenviar-foto-e-reprocessar-design.md`

**Branches:** `feature/09-reenviar-foto-e-reprocessar` nos três repos, todas saindo de `develop`.

---

## ⚠️ O que já existe e NÃO se constrói de novo

- **`AcaoSugerida` está pronto** (`historico/falha/codigo-falha.ts`): `reprocessar`, `reenviar_foto`, `falar_com_suporte`. Os 13 códigos já mapeiam. O card original propunha criar isso com valores **errados** (`aguardar` não existe; `reprocessar` faltava). **Não tocar no mapa.**
- **O client já tipa `AcaoSugerida`** em `FalhaHistorico` (`dtos/cartaoResposta/resultados.ts`) e o campo já viaja ponta a ponta. Falta só a tela ler.
- **`decodeCartaoQr`** (api) devolve `{ simuladoId, cartaoCode }`.
- **`marcarFalha`** (ms) grava status + falha numa escrita só.

---

## Estrutura de arquivos

### ms-simulado

| arquivo | responsabilidade |
|---|---|
| `src/modules/historico/historico.schema.ts` | +`ultimaTentativaEm` |
| `src/modules/historico/historico.repository.ts` | +`reabrirParaOmr` (a escrita atômica) |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts` | +`buscarPorHistorico` (o gate) |
| `src/modules/cartao-resposta/cartao-reprocesso.service.ts` | **novo** — as regras |
| `src/modules/cartao-resposta/dtos/reprocessar-cartao.dto.input.ts` | **novo** |
| `src/modules/cartao-resposta/cartao-resposta.controller.ts` | +rota |
| `src/modules/cartao-resposta/cartao-resposta.module.ts` | +provider |

### api-vcnafacul

| arquivo | responsabilidade |
|---|---|
| `src/modules/simulado/cartao-resposta/cartao-resposta-http.service.ts` | +`reprocessar` |
| `src/modules/simulado/cartao-resposta/cartao-reprocesso.service.ts` | **novo** — QR, bucket, cache |
| `src/modules/simulado/cartao-resposta/cartao-resposta.controller.ts` | +rota |
| `src/modules/simulado/cartao-resposta/cartao-resposta.module.ts` | +provider |

### client-vcnafacul

| arquivo | responsabilidade |
|---|---|
| `src/services/cartaoResposta/reprocessarCartao.ts` | **novo** |
| `src/pages/relatorioSimulado/AcaoDeReenvio.tsx` | **novo** — o ramo por `acaoSugerida` |
| `src/pages/relatorioSimulado/DetalheDoEstudante.tsx` | +`historicoId` e a ação |
| `src/pages/relatorioSimulado/index.tsx` | passa o `historicoId` adiante |

---

## ⚠️ Regras da casa

- **ms:** `npx jest --detectOpenHandles --forceExit <caminho>`. ⚠️ **NUNCA `yarn lint`** — reformata o repo; use `npx eslint <caminho>`.
- **api:** `npx jest <caminho>`. ⚠️ **NUNCA `npm test`** — sobe Docker MySQL e a e2e inteira.
- **client:** `npx vitest run <caminho>`. ⚠️ `npm run lint` está quebrado — `ESLINT_USE_FLAT_CONFIG=false npx eslint <caminhos>`. ⚠️ **`@testing-library/user-event` NÃO está instalado.** ⚠️ **`npx tsc --noEmit -p tsconfig.app.json` não checa nada em `src/`** — o typecheck é `npm run build`.
- Commitar **adicionando por nome**.

---

## Task 1: O campo e a escrita atômica

⚠️ **Uma escrita, não duas.** O docblock do `marcarFalha` já nomeia este card: *"o card 09 precisa da operação inversa (voltar o status e `$unset` a falha), e em duas escritas existe uma janela em que a tela mostra 'processando' com a mensagem de erro anterior ao lado."*

**Files:**
- Modify: `src/modules/historico/historico.schema.ts`
- Modify: `src/modules/historico/historico.repository.ts`
- Test: `src/modules/historico/historico.repository.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

⚠️ **Leia o arquivo de spec primeiro** — ele já tem um padrão de dublê do model. Reuse; não reescreva o helper de outro bloco.

```ts
describe('HistoricoRepository.reabrirParaOmr', () => {
  it('⚠️ muda status, chave e tentativa E apaga a falha na MESMA escrita', async () => {
    // Em duas escritas existe uma janela em que a tela mostra "processando"
    // com a mensagem de erro anterior ao lado. O docblock do `marcarFalha`
    // registra isso desde o card 01.
    const { repo, findByIdAndUpdate } = montar();

    await repo.reabrirParaOmr('h1', { imageKey: 'cartoes/abc/nova.jpg', quando: new Date('2026-09-20T10:00:00Z') });

    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({
      status: 'awaiting_omr',
      imageKey: 'cartoes/abc/nova.jpg',
      ultimaTentativaEm: new Date('2026-09-20T10:00:00Z'),
    });
    expect(update.$unset).toHaveProperty('falha');
  });

  it('sem imageKey nova, a chave atual é preservada', async () => {
    // é o caminho do `reprocessar`: a foto serve, quem falhou foi a infra
    const { repo, findByIdAndUpdate } = montar();

    await repo.reabrirParaOmr('h1', { quando: new Date() });

    const [, update] = findByIdAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('imageKey');
    expect(update.$unset).toHaveProperty('falha');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/historico/historico.repository.spec.ts`
Expected: FAIL — `repo.reabrirParaOmr is not a function`.

- [ ] **Step 3: Acrescentar o campo ao schema**

Em `historico.schema.ts`, junto dos outros `@Prop`:

```ts
  /**
   * Quando o cartão foi (re)enviado ao OMR pela última vez. Base do rate limit
   * do reprocessamento.
   *
   * ⚠️ Campo próprio porque **não há de onde derivar**: este schema é
   * `@Schema({ timestamps: false })` e não tem `createdAt` nem `updatedAt`.
   *
   * ⚠️ Ausente = nunca tentou. Documento antigo passa direto na primeira
   * tentativa, sem migração.
   */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public ultimaTentativaEm?: Date;
```

- [ ] **Step 4: Implementar o método**

No `historico.repository.ts`, perto do `marcarFalha`:

```ts
  /**
   * A operação inversa do `marcarFalha`: devolve o histórico para a fila do OMR.
   *
   * ⚠️ **Uma escrita, e isso é o ponto.** O `$set` e o `$unset` vão juntos: em
   * duas operações existe uma janela em que a tela mostra "processando" com a
   * mensagem de erro anterior ao lado. É o que o docblock do `marcarFalha` já
   * antecipava para este card.
   *
   * ⚠️ `imageKey` só entra no `$set` quando há foto nova. Omitido, a chave
   * atual fica — é o caminho do `reprocessar`, em que a infra falhou e a foto
   * serve.
   */
  async reabrirParaOmr(
    id: string,
    dados: { imageKey?: string; quando: Date },
  ): Promise<void> {
    const set: Record<string, unknown> = {
      status: HistoricoStatus.AwaitingOmr,
      ultimaTentativaEm: dados.quando,
    };
    if (dados.imageKey !== undefined) {
      set.imageKey = dados.imageKey;
    }

    await this.model
      .findByIdAndUpdate(id, { $set: set, $unset: { falha: '' } })
      .exec();
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/historico/`
Expected: PASS

- [ ] **Step 6: Provar que o teste discrimina**

Quebre em duas escritas (`findByIdAndUpdate` com `$set`, depois outro com `$unset`). O primeiro teste tem que **falhar** no `toHaveBeenCalledTimes(1)`. Reverta e confirme verde. Reporte.

- [ ] **Step 7: Commit**

```bash
git add src/modules/historico/historico.schema.ts src/modules/historico/historico.repository.ts src/modules/historico/historico.repository.spec.ts
git commit -m "feat: reabrir histórico para o OMR numa escrita só"
```

---

## Task 2: O gate pela junção

⚠️ **O gate é o filtro.** A junção tem índice único em `{simulado, cursinhoId, usuario}` e guarda `historico`. Achar por `{ historico, cursinhoId }` já não encontra histórico de outro cursinho.

⚠️ **Mas isso é verdade sobre o filtro, e não sobre quem escolhe o argumento.** O `cursinhoId` só é confiável porque sai do JWT na api e viaja **no corpo**. Este projeto já escreveu essa frase pela metade uma vez, e custou um vazamento.

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

⚠️ **Não crie spec novo** — reuse o Mongo que o arquivo já sobe. Acrescente um `describe` irmão, como os blocos vizinhos fazem.

```ts
  describe('buscarPorHistorico (Mongo real)', () => {
    const SIM_R = new Types.ObjectId();
    let histId: string;

    beforeAll(async () => {
      const h = await histModel.create({
        usuario: 'u-rep', simulado: SIM_R, status: 'failed',
        falha: { codigo: 'cartao_nao_detectado' },
      });
      histId = h._id.toString();
      await relModel.create({
        historico: h._id, simulado: SIM_R, usuario: 'u-rep', cursinhoId: 'cur-rep',
      });
    }, 120_000);

    it('acha a linha pelo histórico, dentro do cursinho', async () => {
      const r = await repo.buscarPorHistorico(histId, 'cur-rep');

      expect(r!.usuario).toBe('u-rep');
    });

    it('⚠️ histórico de OUTRO cursinho não é encontrado — o filtro é o gate', async () => {
      const r = await repo.buscarPorHistorico(histId, 'cur-alheio');

      expect(r).toBeNull();
    });

    it('histórico que não existe devolve null', async () => {
      const r = await repo.buscarPorHistorico(
        new Types.ObjectId().toString(),
        'cur-rep',
      );

      expect(r).toBeNull();
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`
Expected: FAIL — `repo.buscarPorHistorico is not a function`.

- [ ] **Step 3: Implementar**

```ts
  /**
   * A linha da junção de um histórico, dentro de um cursinho.
   *
   * ⚠️ **O filtro é o gate**: `cursinhoId` no próprio `findOne` já não encontra
   * histórico de outro cursinho, sem checagem separada que alguém possa
   * esquecer. Mas isso vale para o FILTRO — o valor tem que vir do JWT, no
   * corpo da requisição, nunca de um segmento de caminho.
   */
  async buscarPorHistorico(
    historicoId: string,
    cursinhoId: string,
  ): Promise<RelatorioSimuladoEstudante | null> {
    return this.model
      .findOne({
        historico: new Types.ObjectId(historicoId),
        cursinhoId,
      })
      .lean()
      .exec() as unknown as Promise<RelatorioSimuladoEstudante | null>;
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: PASS, e os blocos que já existiam continuam verdes.

- [ ] **Step 5: Provar que o teste discrimina**

Tire `cursinhoId` do filtro. O teste do cursinho alheio tem que **falhar**. Reverta. Reporte o que viu — é o gate inteiro.

- [ ] **Step 6: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts
git commit -m "feat: achar a linha da juncao por historico e cursinho"
```

---

## Task 3: As regras do reprocessamento, no ms

**Files:**
- Create: `src/modules/cartao-resposta/dtos/reprocessar-cartao.dto.input.ts`
- Create: `src/modules/cartao-resposta/cartao-reprocesso.service.ts`
- Create: `src/modules/cartao-resposta/cartao-reprocesso.service.spec.ts`
- Modify: `src/modules/cartao-resposta/cartao-resposta.module.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CartaoReprocessoService } from './cartao-reprocesso.service';

const SIM = '665f0c1a2b3c4d5e6f00abc2';
const AGORA = new Date('2026-09-20T10:00:00Z');

const montar = (over: any = {}) => {
  const historicoRepository = {
    getById: jest.fn().mockResolvedValue(
      over.historico === undefined
        ? {
            _id: 'h1',
            status: 'failed',
            cartaoCode: '7',
            simulado: SIM,
            ultimaTentativaEm: undefined,
          }
        : over.historico,
    ),
    reabrirParaOmr: jest.fn(),
    marcarFalha: jest.fn(),
  };
  const relatorioRepository = {
    buscarPorHistorico: jest
      .fn()
      .mockResolvedValue(over.linha === undefined ? { usuario: 'u1' } : over.linha),
  };
  const omrHttp = { enviarProcessamento: over.enviar ?? jest.fn() };
  const svc = new CartaoReprocessoService(
    historicoRepository as any,
    relatorioRepository as any,
    omrHttp as any,
  );
  return { svc, historicoRepository, relatorioRepository, omrHttp };
};

const pedido = (over: any = {}) => ({
  historicoId: 'h1',
  cursinhoId: 'cur-1',
  simuladoId: SIM,
  cartaoCode: '7',
  imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
  agora: AGORA,
  ...over,
});

describe('CartaoReprocessoService', () => {
  it('reabre o histórico e aciona o OMR', async () => {
    const { svc, historicoRepository, omrHttp } = montar();

    await svc.reprocessar(pedido());

    expect(historicoRepository.reabrirParaOmr).toHaveBeenCalledWith('h1', {
      imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
      quando: AGORA,
    });
    expect(omrHttp.enviarProcessamento).toHaveBeenCalledWith(
      'cartoes/665f0c1a2b3c4d5e6f00abc2/nova.jpg',
    );
  });

  it('⚠️ histórico de outro cursinho dá 404, e nada é escrito', async () => {
    const { svc, historicoRepository } = montar({ linha: null });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(NotFoundException);
    expect(historicoRepository.reabrirParaOmr).not.toHaveBeenCalled();
  });

  it('⚠️ status que não é failed dá 409', async () => {
    // reprocessar um cartão que está lendo abriria corrida com o callback em voo
    const { svc } = montar({
      historico: { _id: 'h1', status: 'completed', cartaoCode: '7', simulado: SIM },
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(ConflictException);
  });

  it('⚠️ QR de OUTRO cartão é recusado — senão a folha errada entra neste histórico', async () => {
    const { svc, historicoRepository } = montar();

    await expect(
      svc.reprocessar(pedido({ cartaoCode: '99' })),
    ).rejects.toThrow(BadRequestException);
    expect(historicoRepository.reabrirParaOmr).not.toHaveBeenCalled();
  });

  it('⚠️ QR de outro SIMULADO também é recusado', async () => {
    const { svc } = montar();

    await expect(
      svc.reprocessar(pedido({ simuladoId: '665f0c1a2b3c4d5e6f00abcf' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('sem foto nova, não confere QR nenhum e mantém a chave', async () => {
    // é o caminho do `reprocessar`: a foto não mudou
    const { svc, historicoRepository } = montar();

    await svc.reprocessar({
      historicoId: 'h1',
      cursinhoId: 'cur-1',
      agora: AGORA,
    } as any);

    expect(historicoRepository.reabrirParaOmr).toHaveBeenCalledWith('h1', {
      quando: AGORA,
    });
  });

  it('⚠️ dentro da janela, recusa dizendo QUANTO falta', async () => {
    const { svc } = montar({
      historico: {
        _id: 'h1', status: 'failed', cartaoCode: '7', simulado: SIM,
        ultimaTentativaEm: new Date(AGORA.getTime() - 20_000),
      },
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow(/40\s*s|0?0:40|40 segundo/i);
  });

  it('passada a janela, libera', async () => {
    const { svc, historicoRepository } = montar({
      historico: {
        _id: 'h1', status: 'failed', cartaoCode: '7', simulado: SIM,
        ultimaTentativaEm: new Date(AGORA.getTime() - 61_000),
      },
    });

    await svc.reprocessar(pedido());

    expect(historicoRepository.reabrirParaOmr).toHaveBeenCalled();
  });

  it('⚠️ falha ao acionar o OMR devolve o histórico para failed', async () => {
    // senão ele fica em awaiting_omr para sempre, e some do relatório como
    // "processando" sem ninguém para consertar
    const { svc, historicoRepository } = montar({
      enviar: jest.fn().mockRejectedValue(new Error('omr fora')),
    });

    await expect(svc.reprocessar(pedido())).rejects.toThrow();
    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'omr_indisponivel',
      expect.any(String),
    );
  });
});
```

⚠️ **Confira o nome real do método que lê um histórico por id** no `HistoricoRepository` antes de escrever o dublê (`getById`? outro?). Use o que existe.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/cartao-resposta/cartao-reprocesso.service.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar o DTO de entrada**

`src/modules/cartao-resposta/dtos/reprocessar-cartao.dto.input.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReprocessarCartaoDtoInput {
  /**
   * ⚠️ **No corpo, nunca no caminho.** Um path param cru já deixou o chamador
   * reescrever a URL que a api manda ao ms — um `?` embutido sobrepunha o
   * `cursinhoId` resolvido do JWT. Ver o `relatorio-http.service.ts` da api.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;

  /** Ausente = a foto não mudou; é o caminho do `reprocessar`. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  imageKey?: string;

  /** Do QR da foto nova. Obrigatório quando há `imageKey`. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  simuladoId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cartaoCode?: string;
}
```

- [ ] **Step 4: Implementar o serviço**

`src/modules/cartao-resposta/cartao-reprocesso.service.ts`:

```ts
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { OmrHttpService } from './omr-http.service';

/**
 * ⚠️ **60 segundos, e a escolha é livre de propósito.** O card original amarrava
 * a janela ao TTL do cache de imagem ("≥ 180s"), porque reusar a `imageKey`
 * fazia o OMR poder ler a foto velha. Medido: o TTL real chega a 3600s do lado
 * do ms-omr, o que tornaria a regra uma hora de espera. Cunhando chave nova a
 * cada troca, a amarra deixa de existir — e a janela passa a ser só ergonomia.
 *
 * Como o limite é POR HISTÓRICO, quem corrige dez cartões diferentes em
 * sequência nunca esbarra nele.
 */
export const JANELA_ENTRE_TENTATIVAS_MS = 60_000;

@Injectable()
export class CartaoReprocessoService {
  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
    private readonly omrHttp: OmrHttpService,
  ) {}

  async reprocessar(params: {
    historicoId: string;
    cursinhoId: string;
    imageKey?: string;
    simuladoId?: string;
    cartaoCode?: string;
    agora: Date;
  }): Promise<void> {
    // ⚠️ O gate. `cursinhoId` no filtro já não encontra histórico alheio — e o
    // valor vem do JWT, no corpo, nunca de um segmento de caminho.
    const linha = await this.relatorioRepository.buscarPorHistorico(
      params.historicoId,
      params.cursinhoId,
    );
    if (!linha) {
      throw new NotFoundException('cartão não encontrado neste cursinho');
    }

    const historico = await this.historicoRepository.getById(params.historicoId);
    if (!historico) {
      throw new NotFoundException('histórico não encontrado');
    }

    // ⚠️ Só cartão falho se reprocessa. Um que está lendo abriria corrida com
    // o callback em voo; um que já leu não tem o que reprocessar.
    if (historico.status !== HistoricoStatus.Failed) {
      throw new ConflictException(
        `só cartão com falha pode ser reprocessado (está ${historico.status})`,
      );
    }

    this.recusarSeCedoDemais(historico.ultimaTentativaEm, params.agora);

    if (params.imageKey !== undefined) {
      this.recusarSeOutroCartao(historico, params);
    }

    await this.historicoRepository.reabrirParaOmr(params.historicoId, {
      ...(params.imageKey !== undefined ? { imageKey: params.imageKey } : {}),
      quando: params.agora,
    });

    try {
      await this.omrHttp.enviarProcessamento(
        params.imageKey ?? historico.imageKey,
      );
    } catch (err) {
      // ⚠️ Sem isto o histórico fica em `awaiting_omr` para sempre e some do
      // relatório como "processando", sem ninguém para consertar.
      //
      // ⚠️ E o diagnóstico ORIGINAL já foi apagado pelo `$unset` — a pessoa
      // acabou de agir sobre ele, então a perda é aceitável, mas é uma perda.
      await this.historicoRepository.marcarFalha(
        params.historicoId,
        CodigoFalhaInterno.OmrIndisponivel,
        err instanceof Error ? err.message : String(err),
      );
      throw new BadGatewayException('falha ao acionar o OMR');
    }
  }

  /**
   * ⚠️ A recusa diz **quanto falta**. Um 429 sem número manda a pessoa tentar
   * de novo na hora, e de novo.
   */
  private recusarSeCedoDemais(ultima: Date | undefined, agora: Date): void {
    // Ausente = nunca tentou. Documento anterior a este card passa direto.
    if (!ultima) return;

    const decorrido = agora.getTime() - new Date(ultima).getTime();
    if (decorrido >= JANELA_ENTRE_TENTATIVAS_MS) return;

    const faltam = Math.ceil((JANELA_ENTRE_TENTATIVAS_MS - decorrido) / 1000);
    throw new ConflictException(
      `aguarde ${faltam}s para tentar novamente neste cartão`,
    );
  }

  /**
   * ⚠️ **O coordenador escolhe o arquivo à mão.** Sem esta conferência, a folha
   * de outro aluno — ou de outro simulado — entra neste histórico, e o
   * relatório fica convincentemente errado.
   */
  private recusarSeOutroCartao(
    historico: { simulado: unknown; cartaoCode?: string },
    params: { simuladoId?: string; cartaoCode?: string },
  ): void {
    const simuladoDoHistorico = String(historico.simulado);
    if (params.simuladoId !== simuladoDoHistorico) {
      throw new BadRequestException(
        'a foto enviada é de outro simulado',
      );
    }
    if (params.cartaoCode !== historico.cartaoCode) {
      throw new BadRequestException(
        'a foto enviada é de outro cartão',
      );
    }
  }
}
```

⚠️ **Confira** o nome real do método de leitura por id no `HistoricoRepository` e ajuste. Se o `getById` popular coisas demais, use o que houver de mais magro — ou acrescente um método enxuto e diga no relatório.

- [ ] **Step 5: Registrar no módulo**

Acrescente `CartaoReprocessoService` aos `providers` do `cartao-resposta.module.ts`. ⚠️ Confira que `RelatorioSimuladoEstudanteRepository` está disponível ali (o `CartaoHistoricoService` já o injeta, então provavelmente sim).

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/cartao-resposta/`
Expected: PASS

- [ ] **Step 7: Provar que três testes discriminam**

**(a)** Tire a checagem de `status !== Failed`. O teste do 409 falha.
**(b)** Tire o `recusarSeOutroCartao`. Os dois testes de QR falham.
**(c)** Tire o `try/catch` do OMR. O teste do `marcarFalha` falha.

Reverta os três. Reporte o que viu em cada.

- [ ] **Step 8: Commit**

```bash
git add src/modules/cartao-resposta/
git commit -m "feat: regras do reprocessamento de cartao no ms"
```

---

## Task 4: A rota do ms

**Files:**
- Modify: `src/modules/cartao-resposta/cartao-resposta.controller.ts`
- Test: `src/modules/cartao-resposta/cartao-resposta.controller.spec.ts` (crie se não existir)

- [ ] **Step 1: Escrever o teste que falha**

```ts
  it('reprocessar repassa o histórico, o cursinho e o QR ao serviço', async () => {
    const service = { reprocessar: jest.fn() };
    const ctrl = new CartaoRespostaController(
      {} as any, {} as any, {} as any, service as any,
    );

    await ctrl.reprocessar('h1', {
      cursinhoId: 'cur-1',
      imageKey: 'cartoes/abc/nova.jpg',
      simuladoId: 'abc',
      cartaoCode: '7',
    } as any);

    expect(service.reprocessar).toHaveBeenCalledWith(
      expect.objectContaining({
        historicoId: 'h1',
        cursinhoId: 'cur-1',
        imageKey: 'cartoes/abc/nova.jpg',
        cartaoCode: '7',
        agora: expect.any(Date),
      }),
    );
  });
```

⚠️ **Confira a ordem real dos parâmetros do construtor** do controller e ajuste o dublê.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/cartao-resposta/`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Injete `CartaoReprocessoService` no construtor, importe o DTO, e acrescente:

```ts
  @Post(':historicoId/reprocessar')
  @HttpCode(202)
  async reprocessar(
    @Param('historicoId') historicoId: string,
    @Body() dto: ReprocessarCartaoDtoInput,
  ): Promise<{ status: string }> {
    await this.cartaoReprocesso.reprocessar({
      historicoId,
      cursinhoId: dto.cursinhoId,
      imageKey: dto.imageKey,
      simuladoId: dto.simuladoId,
      cartaoCode: dto.cartaoCode,
      // O relógio entra pela borda: o serviço é puro quanto a tempo, e o rate
      // limit fica testável sem fake timers.
      agora: new Date(),
    });
    return { status: 'aceito' };
  }
```

⚠️ **Roteamento:** a rota tem dois segmentos e é `POST`; as existentes são `POST historico`, `POST callback` (um segmento) e `GET :simuladoId`. Não colide. **Mas confirme com um teste que suba o app** se o arquivo de spec do controller já tiver esse padrão; se não tiver, diga no relatório que não há e siga.

- [ ] **Step 4: Rodar, build e commit**

```bash
npx jest --detectOpenHandles --forceExit src/modules/cartao-resposta/ src/modules/historico/ src/modules/relatorio-simulado-estudante/
npm run build
npx eslint src/modules/cartao-resposta src/modules/historico src/modules/relatorio-simulado-estudante
git add src/modules/cartao-resposta/
git commit -m "feat: rota de reprocessamento no ms"
```

---

## Task 5: A api — QR, bucket, cache e a rota

**Repo:** `api-vcnafacul`. ⚠️ **A branch não existe.** Crie de uma `develop` fresca:
```bash
cd ../api-vcnafacul && git checkout develop && git pull origin develop && git checkout -b feature/09-reenviar-foto-e-reprocessar
```

**Files:**
- Modify: `src/modules/simulado/cartao-resposta/cartao-resposta-http.service.ts`
- Create: `src/modules/simulado/cartao-resposta/cartao-reprocesso.service.ts`
- Create: `src/modules/simulado/cartao-resposta/cartao-reprocesso.service.spec.ts`
- Modify: `src/modules/simulado/cartao-resposta/cartao-resposta.controller.ts`
- Modify: `src/modules/simulado/cartao-resposta/cartao-resposta.module.ts`

- [ ] **Step 1: Escrever os testes que falham**

**(a)** No spec do http service (reuse o `montar()` que já existe):

```ts
  it('reprocessar manda o cursinho e o QR no CORPO, não no caminho', async () => {
    // ⚠️ Um path param cru já deixou o chamador reescrever a URL do ms — um
    // `?` embutido sobrepunha o cursinhoId do JWT. O `historicoId` vai no
    // caminho e é encodado; o resto vai no corpo.
    const { svc, axios } = montar();

    await svc.reprocessar('h1', {
      cursinhoId: 'cur-1',
      imageKey: 'cartoes/abc/nova.jpg',
      simuladoId: 'abc',
      cartaoCode: '7',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'v1/cartao-resposta/h1/reprocessar',
      expect.objectContaining({ cursinhoId: 'cur-1', cartaoCode: '7' }),
    );
  });

  it('⚠️ historicoId vai encodado', async () => {
    const { svc, axios } = montar();

    await svc.reprocessar('h1?x=1', { cursinhoId: 'cur-1' });

    const url = axios.post.mock.calls[0][0] as string;
    expect(url.split('?')).toHaveLength(1);
  });
```

⚠️ **Confira se o `montar()` do arquivo expõe `axios.post`** — os métodos existentes usam `get`. Se não expuser, acrescente `post: jest.fn()` ao dublê, **aditivamente**.

**(b)** No spec novo do serviço da api:

```ts
const montar = (over: any = {}) => {
  const blobService = { putObjectAtKey: jest.fn() };
  const omrCache = { primeImagem: jest.fn() };
  const cartaoHttp = { reprocessar: over.reprocessar ?? jest.fn() };
  const env = { get: jest.fn().mockReturnValue('bucket-cartao') };
  const cursinhoResolver = {
    resolveCursinhoIdByUserId: jest.fn().mockResolvedValue('cur-1'),
  };
  const svc = new CartaoReprocessoService(
    blobService as any, omrCache as any, cartaoHttp as any,
    env as any, cursinhoResolver as any,
  );
  return { svc, blobService, omrCache, cartaoHttp, cursinhoResolver };
};

const arquivo = { buffer: Buffer.from('foto'), mimetype: 'image/jpeg' } as any;

describe('CartaoReprocessoService (api)', () => {
  beforeEach(() => {
    vi_ou_jest_mock_do_qr.mockResolvedValue({ simuladoId: 'sim-1', cartaoCode: '7' });
  });

  it('⚠️ cunha uma imageKey NOVA — nunca reusa a do histórico', async () => {
    // Chave inédita nunca esteve no cache do OMR, então não há foto velha a
    // servir. É o que dissolve o risco 1 do card.
    const { svc, blobService } = montar();

    await svc.processar('colab-1', 'h1', arquivo);

    const [, , key] = blobService.putObjectAtKey.mock.calls[0];
    expect(key).toMatch(/^cartoes\/sim-1\/[0-9a-f-]{36}\.jpg$/);
  });

  it('⚠️ duas chamadas geram chaves DIFERENTES', async () => {
    const { svc, blobService } = montar();

    await svc.processar('colab-1', 'h1', arquivo);
    await svc.processar('colab-1', 'h1', arquivo);

    const k1 = blobService.putObjectAtKey.mock.calls[0][2];
    const k2 = blobService.putObjectAtKey.mock.calls[1][2];
    expect(k1).not.toBe(k2);
  });

  it('⚠️ bucket ANTES do cache, e o ms por último', async () => {
    // Se o cache falhar, o OMR busca do bucket, que já tem a foto certa.
    // Invertido, o cache vira a fonte da verdade por até uma hora.
    const ordem: string[] = [];
    const { svc, blobService, omrCache, cartaoHttp } = montar();
    blobService.putObjectAtKey.mockImplementation(async () => { ordem.push('bucket'); });
    omrCache.primeImagem.mockImplementation(async () => { ordem.push('cache'); });
    cartaoHttp.reprocessar.mockImplementation(async () => { ordem.push('ms'); });

    await svc.processar('colab-1', 'h1', arquivo);

    expect(ordem).toEqual(['bucket', 'cache', 'ms']);
  });

  it('manda o QR decodificado ao ms, para ele conferir', async () => {
    const { svc, cartaoHttp } = montar();

    await svc.processar('colab-1', 'h1', arquivo);

    expect(cartaoHttp.reprocessar).toHaveBeenCalledWith(
      'h1',
      expect.objectContaining({
        cursinhoId: 'cur-1',
        simuladoId: 'sim-1',
        cartaoCode: '7',
      }),
    );
  });

  it('sem arquivo, chama o ms sem imageKey e não toca no bucket', async () => {
    const { svc, blobService, cartaoHttp } = montar();

    await svc.processar('colab-1', 'h1', undefined);

    expect(blobService.putObjectAtKey).not.toHaveBeenCalled();
    expect(cartaoHttp.reprocessar).toHaveBeenCalledWith('h1', {
      cursinhoId: 'cur-1',
    });
  });

  it('⚠️ o cursinho vem do JWT, nunca do corpo', async () => {
    const { svc, cursinhoResolver } = montar();

    await svc.processar('colab-1', 'h1', arquivo);

    expect(cursinhoResolver.resolveCursinhoIdByUserId).toHaveBeenCalledWith('colab-1');
  });
});
```

⚠️ **Leia o spec do `CartaoUploadService`** antes — ele já mocka `decodeCartaoQr` e o `BlobService`, e você deve usar o mesmo mecanismo (`jest.mock` do módulo do qr-decoder). Adapte os nomes ao que estiver lá; o esqueleto acima usa um placeholder de nome (`vi_ou_jest_mock_do_qr`) **que você deve substituir pelo mock real**.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx jest src/modules/simulado/cartao-resposta`
Expected: FAIL.

- [ ] **Step 3: Implementar o http service**

```ts
  async reprocessar(
    historicoId: string,
    corpo: {
      cursinhoId: string;
      imageKey?: string;
      simuladoId?: string;
      cartaoCode?: string;
    },
  ): Promise<void> {
    // ⚠️ `encodeURIComponent` no segmento, e todo o resto no CORPO. Um path
    // param cru já deixou o chamador reescrever a URL do ms.
    await this.axios.post(
      `v1/cartao-resposta/${encodeURIComponent(historicoId)}/reprocessar`,
      corpo,
    );
  }
```

⚠️ **Confira se o `HttpServiceAxios` desta casa tem `post`** e qual a assinatura. Se só tiver `get`, diga no relatório em vez de inventar.

- [ ] **Step 4: Implementar o serviço da api**

```ts
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EnvService } from 'src/shared/modules/env/env.service';
import { BlobService } from 'src/shared/services/blob/blob-service';
import { CursinhoResolverService } from '../prova/cursinho/cursinho-resolver.service';
import { CartaoRespostaHttpService } from './cartao-resposta-http.service';
import { OmrCacheService } from './omr-cache.service';
import { decodeCartaoQr } from './qr-decoder';

@Injectable()
export class CartaoReprocessoService {
  private readonly logger = new Logger(CartaoReprocessoService.name);

  constructor(
    @Inject('BlobService')
    private readonly blobService: BlobService,
    private readonly omrCache: OmrCacheService,
    private readonly cartaoHttp: CartaoRespostaHttpService,
    private readonly env: EnvService,
    private readonly cursinhoResolver: CursinhoResolverService,
  ) {}

  /**
   * Troca a foto (ou só pede nova tentativa) de um cartão que falhou.
   *
   * ⚠️ **Chave NOVA a cada troca, nunca a do histórico.** O ms-omr lê a imagem
   * com cache-first e recarimba a chave com TTL de até 3600s; reusar a chave
   * faria uma tentativa nova poder ler a foto velha por até uma hora, e o
   * `primeImagem` **engole erro e só loga**, então nem regravar o cache
   * resolveria de forma confiável. Chave inédita nunca esteve lá.
   */
  async processar(
    colaboradorUserId: string,
    historicoId: string,
    file?: Express.Multer.File,
  ): Promise<void> {
    // ⚠️ Do JWT, nunca do corpo. Mesmo padrão do `CartaoUploadService`.
    const cursinhoId =
      await this.cursinhoResolver.resolveCursinhoIdByUserId(colaboradorUserId);

    if (!file?.buffer) {
      // Caminho do `reprocessar`: a foto serve, quem falhou foi a infra.
      await this.cartaoHttp.reprocessar(historicoId, { cursinhoId });
      return;
    }

    const { simuladoId, cartaoCode } = await decodeCartaoQr(file.buffer);
    const imageKey = `cartoes/${simuladoId}/${uuidv4()}.jpg`;

    // ⚠️ Bucket ANTES do cache: se o cache falhar, o OMR busca do bucket, que
    // já tem a foto certa. Invertido, o cache vira a fonte da verdade.
    await this.blobService.putObjectAtKey(
      file.buffer,
      this.env.get('BUCKET_CARTAO'),
      imageKey,
      file.mimetype ?? 'image/jpeg',
    );
    await this.omrCache.primeImagem(imageKey, file.buffer);

    try {
      // ⚠️ O ms confere se o QR é do MESMO cartão — é lá que o histórico está.
      await this.cartaoHttp.reprocessar(historicoId, {
        cursinhoId,
        imageKey,
        simuladoId,
        cartaoCode,
      });
    } catch (err) {
      // ⚠️ Órfã assumida: o bucket já foi escrito. Uma recusa (QR de outro
      // cartão, janela do rate limit) deixa o arquivo lá. É uma imagem perdida
      // quando um humano escolhe o arquivo errado — mais barato que uma ida
      // extra ou uma escrita em duas fases. Mas **logar**, para não virar
      // crescimento silencioso.
      this.logger.warn(
        `imagem ${imageKey} ficou órfã no bucket: o reprocessamento de ${historicoId} foi recusado`,
      );
      throw err;
    }
  }
}
```

⚠️ **Se `BadRequestException` ficar sem uso, remova o import** — o lint reclama.

- [ ] **Step 5: A rota, com permissão e limite de tamanho**

No `cartao-resposta.controller.ts` da api:

```ts
/**
 * ⚠️ 8 MB. A rota de upload que já existe **não tem limite nenhum** — o
 * `FileInterceptor('file')` de lá não recebe `limits`, e o `json({ limit })`
 * global não vale para multipart. Esta nasce com limite; a antiga fica
 * registrada no card como pendência.
 */
const TAMANHO_MAXIMO_CARTAO = 8 * 1024 * 1024;

  @Post(':historicoId/reprocessar')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetMetadata(PermissionsGuard.name, Permissions.gerenciarEstudantes)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: TAMANHO_MAXIMO_CARTAO } }),
  )
  @ApiBearerAuth()
  @ApiResponse({ status: 202, description: 'reprocessamento aceito' })
  @ApiResponse({ status: 400, description: 'a foto é de outro cartão ou de outro simulado' })
  @ApiResponse({ status: 409, description: 'cartão não está com falha, ou tentativa cedo demais' })
  async reprocessar(
    @Param('historicoId') historicoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ): Promise<void> {
    return this.reprocessoService.processar(
      (req.user as User).id,
      historicoId,
      file,
    );
  }
```

⚠️ **`gerenciarEstudantes`, e não `visualizarEstudantes`** como a rota de upload vizinha. Alinha com o relatório de onde a ação nasce. **A inconsistência com o upload fica registrada e não é consertada aqui** — mudar permissão de rota em produção escondida num PR de feature é o que esta série recusou a fazer três vezes.

Registre o serviço nos `providers` do módulo.

- [ ] **Step 6: Rodar, build e commit**

```bash
npx jest src/modules/simulado
npm run build
git add src/modules/simulado/cartao-resposta/
git commit -m "feat: rota de reprocessamento na api, com chave nova por tentativa"
```

⚠️ **Não rode `npm test`.**

---

## Task 6: O client — serviço e o ramo por `acaoSugerida`

**Repo:** `client-vcnafacul`. ⚠️ **A branch não existe.** Crie de uma `develop` fresca:
```bash
cd ../client-vcnafacul && git checkout develop && git pull origin develop && git checkout -b feature/09-reenviar-foto-e-reprocessar
```

**Files:**
- Create: `src/services/cartaoResposta/reprocessarCartao.ts`
- Create: `src/pages/relatorioSimulado/AcaoDeReenvio.tsx`
- Create: `src/pages/relatorioSimulado/AcaoDeReenvio.test.tsx`
- Modify: `src/pages/relatorioSimulado/DetalheDoEstudante.tsx`
- Modify: `src/pages/relatorioSimulado/index.tsx`

- [ ] **Step 1: Escrever os testes que falham**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcaoDeReenvio } from "./AcaoDeReenvio";

const reprocessarCartao = vi.hoisted(() => vi.fn());
vi.mock("@/services/cartaoResposta/reprocessarCartao", () => ({
  reprocessarCartao,
}));

const falha = (acaoSugerida: string) => ({
  codigo: "cartao_nao_detectado",
  descricao: "Não foi possível localizar o cartão na foto",
  acaoSugerida,
});

const montar = (acao: string, over = {}) =>
  render(
    <AcaoDeReenvio
      token="tok"
      historicoId="h1"
      falha={falha(acao) as never}
      onReenviado={vi.fn()}
      {...over}
    />,
  );

describe("AcaoDeReenvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reprocessarCartao.mockResolvedValue(undefined);
  });

  it("⚠️ reenviar_foto pede arquivo", async () => {
    const { container } = montar("reenviar_foto");

    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("⚠️ reprocessar NÃO pede arquivo — a mesma foto serve", async () => {
    // motor_timeout, armazenamento_indisponivel e omr_indisponivel mapeiam
    // para cá: falhou a infra, não a imagem. Pedir foto nova faria o cursinho
    // refotografar à toa.
    const { container } = montar("reprocessar");

    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole("button", { name: /tentar/i })).toBeInTheDocument();
  });

  it("⚠️ falar_com_suporte não oferece ação nenhuma", async () => {
    const { container } = montar("falar_com_suporte");

    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("reprocessar chama o serviço sem arquivo", async () => {
    montar("reprocessar");

    fireEvent.click(screen.getByRole("button", { name: /tentar/i }));

    await waitFor(() =>
      expect(reprocessarCartao).toHaveBeenCalledWith("tok", "h1", undefined),
    );
  });

  it("⚠️ a recusa por janela mostra o tempo que falta, não um erro genérico", async () => {
    // um 429 sem número manda a pessoa tentar de novo na hora, e de novo
    reprocessarCartao.mockRejectedValue(
      new Error("aguarde 42s para tentar novamente neste cartão"),
    );
    montar("reprocessar");

    fireEvent.click(screen.getByRole("button", { name: /tentar/i }));

    expect(await screen.findByText(/42s/)).toBeInTheDocument();
  });

  it("avisa quem montou depois de reenviar, para a tela recarregar", async () => {
    const onReenviado = vi.fn();
    montar("reprocessar", { onReenviado });

    fireEvent.click(screen.getByRole("button", { name: /tentar/i }));

    await waitFor(() => expect(onReenviado).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/relatorioSimulado/AcaoDeReenvio.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar o serviço**

`src/services/cartaoResposta/reprocessarCartao.ts`:

```ts
import fetchWrapper from "@/utils/fetchWrapper";
import { cartaoResposta } from "../urls";

/**
 * Pede nova leitura de um cartão que falhou, com ou sem foto nova.
 *
 * ⚠️ A mensagem do backend é repassada tal e qual nas recusas de 400 e 409 —
 * ela carrega o motivo (outro cartão, outro simulado) e, no rate limit, o
 * tempo que falta. Trocar por um texto genérico aqui apagaria justamente a
 * parte acionável.
 */
export async function reprocessarCartao(
  token: string,
  historicoId: string,
  file?: File,
): Promise<void> {
  const formData = new FormData();
  if (file) formData.append("file", file);

  const response = await fetchWrapper(
    `${cartaoResposta}/${historicoId}/reprocessar`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  if (response.status === 400 || response.status === 409) {
    const corpo = await response.json().catch(() => ({}));
    throw new Error(corpo.message ?? "Não foi possível reprocessar o cartão");
  }
  if (response.status !== 202 && response.status !== 200) {
    throw new Error("Erro ao reprocessar o cartão");
  }
}
```

⚠️ **Sem `Content-Type`** — o navegador põe o boundary do multipart. É o que o `uploadCartao.ts` já faz.

- [ ] **Step 4: Criar o componente**

`src/pages/relatorioSimulado/AcaoDeReenvio.tsx`:

```tsx
import { dashV2 } from "@/components/dashV2";
import type { FalhaHistorico } from "@/dtos/cartaoResposta/resultados";
import { cn } from "@/lib/utils";
import { reprocessarCartao } from "@/services/cartaoResposta/reprocessarCartao";
import { useRef, useState } from "react";

export const TEXTO_REENVIAR = "Reenviar foto";
export const TEXTO_REPROCESSAR = "Tentar de novo";

/**
 * O que oferecer depende do `acaoSugerida` que o ms manda pronto.
 *
 * ⚠️ **A tela não conhece código de erro nenhum** — é o ponto do mapa do card
 * `01`: mudar um texto ou reclassificar um código não toca em componente.
 *
 * ⚠️ E são DUAS ações, não uma. `reprocessar` cobre `motor_timeout`,
 * `armazenamento_indisponivel` e `omr_indisponivel`: falhou a infra, a foto
 * está boa. Oferecer "reenviar foto" nesses casos faria o cursinho
 * refotografar à toa.
 */
export function AcaoDeReenvio({
  token,
  historicoId,
  falha,
  onReenviado,
}: {
  token: string;
  historicoId: string;
  falha: FalhaHistorico;
  onReenviado: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (falha.acaoSugerida === "falar_com_suporte") return null;

  const pedeFoto = falha.acaoSugerida === "reenviar_foto";

  const enviar = async (file?: File) => {
    setEnviando(true);
    setErro(null);
    try {
      await reprocessarCartao(token, historicoId, file);
      onReenviado();
    } catch (e) {
      // ⚠️ A mensagem do backend inteira: ela diz QUAL cartão divergiu, ou
      // quantos segundos faltam. Um texto genérico apaga a parte acionável.
      setErro(e instanceof Error ? e.message : "Não foi possível reprocessar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {pedeFoto && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={enviando}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void enviar(file);
          }}
          className={cn("text-sm", dashV2.text.secondary)}
        />
      )}

      {!pedeFoto && (
        <button
          type="button"
          disabled={enviando}
          onClick={() => void enviar()}
          className={cn(
            "rounded-sm text-sm font-medium underline-offset-2 hover:underline",
            dashV2.text.primary,
            dashV2.focus,
          )}
        >
          {enviando ? "Enviando…" : TEXTO_REPROCESSAR}
        </button>
      )}

      {erro && (
        <p className={cn("text-sm", dashV2.text.secondary)} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
```

⚠️ **`TEXTO_REENVIAR` fica exportado para o teste que o usar; se ninguém usar, tire o export** — o lint reclama de export morto, e a regra `react-refresh/only-export-components` já mordeu esta pasta antes.

- [ ] **Step 5: Ligar no modal, e levar o `historicoId` até lá**

O `DetalheDoEstudante` **não recebe o `historicoId` hoje**. Acrescente à prop `estudante`:

```tsx
export interface EstudanteDoDetalhe {
  usuario: string;
  nome: string;
  matricula: string;
  /** ⚠️ Necessário para reprocessar. Vem de `LinhaDoRelatorio.historicoId`. */
  historicoId?: string;
}
```

No corpo, junto do bloco que mostra a descrição da falha:

```tsx
        {estado === "idle" &&
          detalhe?.status === "failed" &&
          detalhe.falha &&
          estudante.historicoId && (
            <AcaoDeReenvio
              token={token}
              historicoId={estudante.historicoId}
              falha={detalhe.falha}
              onReenviado={carregar}
            />
          )}
```

⚠️ **`onReenviado={carregar}`** — recarrega o detalhe, que agora volta como "processando". **Não acrescente polling neste card**: uma tela que se atualiza sozinha é outro assunto.

E em `index.tsx`, ao montar o modal, passe o id:

```tsx
            estudante={{
              usuario: aberto.usuario,
              nome: aberto.nome,
              matricula: aberto.matricula,
              historicoId: aberto.historicoId,
            }}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/pages/relatorioSimulado/ src/services/`
Expected: PASS

- [ ] **Step 7: Provar que dois testes discriminam**

**(a)** Faça `pedeFoto` sempre `true`. O teste de `reprocessar` não pedir arquivo falha.
**(b)** Troque a mensagem de erro por um texto fixo. O teste do tempo restante falha.

Reverta e confirme. Reporte.

- [ ] **Step 8: Suíte, build e commit**

```bash
npx vitest run
npm run build
ESLINT_USE_FLAT_CONFIG=false npx eslint src/pages/relatorioSimulado src/services/cartaoResposta
git add src/services/cartaoResposta/reprocessarCartao.ts src/pages/relatorioSimulado/
git commit -m "feat: acao de reenvio de foto no detalhe do estudante"
```

---

## Fechamento

⚠️ **Gate manual, para os PRs** — jsdom e dublê não alcançam:

1. **O teste que prova o item do cache:** subir uma foto ruim, deixar falhar, trocar por uma boa **em segundos**, e conferir que o resultado sai com as respostas da foto **nova**. É o critério de aceite que só um ambiente de verdade fecha.
2. Reenviar a folha de **outro aluno** e conferir a recusa com motivo.
3. Duas tentativas seguidas no mesmo cartão: a segunda diz quantos segundos faltam.
4. Um cartão com `motor_timeout`: oferece "Tentar de novo" **sem** seletor de arquivo.
