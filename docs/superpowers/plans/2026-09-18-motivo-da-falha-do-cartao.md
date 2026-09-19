# O motivo da falha do cartão chega a quem usa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar de descartar o motivo da falha do cartão-resposta — persistir código e detalhe no `Historico`, derivar uma descrição legível na leitura, e mostrá-la na tela que o coordenador já usa.

**Architecture:** O `Historico` grava só os dois fatos (`codigo`, `detalhe`). Um mapa explícito em `src/modules/historico/falha/` traduz código → descrição + `acaoSugerida`, e uma função pura `descreverFalha` é aplicada na camada de serviço, de modo que nenhuma tela conheça código de erro. Os seis pontos que hoje gravam `Failed` mudo passam por um único `marcarFalha`, que escreve status e falha numa operação só.

**Tech Stack:** NestJS 10 + Mongoose (ms-simulado, Jest); React 19 + Vite (client-vcnafacul, Vitest + Testing Library). **A api-vcnafacul não muda** — é passthrough puro.

**Spec:** `docs/superpowers/specs/2026-09-18-motivo-da-falha-do-cartao-design.md`

**Branches:** `feature/01-motivo-da-falha-do-cartao` no **ms-simulado** (já criada, spec commitado) e a criar no **client-vcnafacul**.

⚠️ O working tree do ms-simulado tem `src/modules/prova/factory/enem_2010_2016_factory.spec.ts` modificado, alheio a este trabalho. **Nunca use `git add -A` ou `git commit -a`** — adicione sempre os arquivos pelo nome.

---

## Estrutura de arquivos

### ms-simulado

| arquivo | responsabilidade | ação |
|---|---|---|
| `src/modules/historico/types/falha.ts` | O que é persistido: `codigo` + `detalhe` | **criar** |
| `src/modules/historico/falha/codigo-falha.ts` | Enum dos códigos que ESTE serviço produz + o tipo `AcaoSugerida` | **criar** |
| `src/modules/historico/falha/mapa-falha.ts` | Mapa código → descrição + ação, o fallback, e `descreverFalha` | **criar** |
| `src/modules/historico/historico.schema.ts` | Ganha o campo `falha` | modificar |
| `src/modules/historico/historico.repository.ts` | Ganha `marcarFalha` (status + falha numa escrita) | modificar |
| `src/modules/historico/historico.service.ts` | Aplica `descreverFalha` em `getAllbyUser` e `getById` | modificar |
| `src/modules/cartao-resposta/cartao-callback.service.ts` | 2 pontos de falha ganham motivo | modificar |
| `src/modules/cartao-resposta/cartao-historico.service.ts` | 1 ponto de falha ganha motivo | modificar |
| `src/modules/cartao-resposta/dtos/cartao-callback.dto.input.ts` | `falha` vira DTO aninhado validado | modificar |
| `src/modules/simulado/simulado.service.ts` | 3 pontos de falha ganham motivo | modificar |

Por que `falha/` é uma pasta própria e não um arquivo dentro de `historico/`: o mapa é lido pela
service **e** escrito por dois módulos diferentes (`cartao-resposta` e `simulado`). Uma pasta com
duas responsabilidades separadas — o vocabulário (`codigo-falha.ts`) e a tradução
(`mapa-falha.ts`) — deixa claro que só o segundo muda quando um texto é ajustado.

### client-vcnafacul

| arquivo | responsabilidade | ação |
|---|---|---|
| `src/dtos/cartaoResposta/resultados.ts` | Tipos da falha que chega do backend | modificar |
| `src/pages/dashProvas/modals/uploadCartaoModal.tsx` | Mostra a descrição na lista; toast honesto | modificar |
| `src/pages/dashProvas/modals/uploadCartaoModal.test.tsx` | Cobre os dois comportamentos | **criar** |

---

## Task 1: O que é gravado — `Historico.falha` e `marcarFalha`

**Repo:** ms-simulado

**Files:**
- Create: `src/modules/historico/types/falha.ts`
- Modify: `src/modules/historico/historico.schema.ts`, `src/modules/historico/historico.repository.ts`
- Test: `src/modules/historico/historico.schema.spec.ts`, `src/modules/historico/historico.repository.spec.ts`

- [ ] **Step 1: Write the failing tests**

Em `src/modules/historico/historico.schema.spec.ts`, acrescente ao final do arquivo:

```ts
describe('Historico schema — campo de falha (card 01)', () => {
  it('tem o path falha', () => {
    expect(HistoricoSchema.path('falha')).toBeDefined();
  });
});
```

Em `src/modules/historico/historico.repository.spec.ts`, acrescente dentro do `describe` existente:

```ts
it('marcarFalha grava status e falha na MESMA escrita', async () => {
  const exec = jest.fn().mockResolvedValue(undefined);
  const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
  const repo = new HistoricoRepository({ findByIdAndUpdate } as any);

  await repo.marcarFalha('h1', 'cartao_nao_detectado', 'sem CSV de Results');

  // uma chamada só: em duas escritas existe uma janela mostrando o status novo
  // com a falha velha ao lado — é o que o card 09 precisa evitar na volta
  expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
  expect(findByIdAndUpdate).toHaveBeenCalledWith('h1', {
    status: 'failed',
    falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV de Results' },
  });
});

it('marcarFalha aceita falha sem detalhe', async () => {
  const exec = jest.fn().mockResolvedValue(undefined);
  const findByIdAndUpdate = jest.fn().mockReturnValue({ exec });
  const repo = new HistoricoRepository({ findByIdAndUpdate } as any);

  await repo.marcarFalha('h1', 'simulado_nao_encontrado');

  expect(findByIdAndUpdate).toHaveBeenCalledWith('h1', {
    status: 'failed',
    falha: { codigo: 'simulado_nao_encontrado', detalhe: undefined },
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/historico/historico.schema.spec.ts src/modules/historico/historico.repository.spec.ts`
Expected: FAIL — `HistoricoSchema.path('falha')` é `undefined` e `repo.marcarFalha is not a function`

- [ ] **Step 3: Write the implementation**

Crie `src/modules/historico/types/falha.ts`:

```ts
import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

/**
 * O que é PERSISTIDO de uma falha: os dois fatos do que aconteceu.
 *
 * A descrição amigável e a `acaoSugerida` NÃO ficam aqui — são derivadas do
 * `codigo` na leitura (ver `../falha/mapa-falha.ts`). Gravá-las congelaria o
 * texto no instante da falha, e ajustar uma frase passaria a exigir migração.
 */
export class FalhaHistorico {
  @Prop()
  @ApiProperty()
  public codigo: string;

  /** Texto cru da origem — inclui o stderr do OMRChecker em `motor_falhou`. */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public detalhe?: string;
}
```

Em `src/modules/historico/historico.schema.ts`, importe o tipo junto dos outros imports de
`./types/...`:

```ts
import { FalhaHistorico } from './types/falha';
```

e acrescente o campo logo depois de `cartaoCode`:

```ts
  @Prop({ type: Object, required: false })
  @ApiProperty({ required: false })
  public falha?: FalhaHistorico;
```

Em `src/modules/historico/historico.repository.ts`, acrescente logo depois de `updateStatus`:

```ts
  /**
   * Marca o histórico como falho E registra o motivo numa ÚNICA escrita.
   *
   * A atomicidade não é detalhe: o card 09 precisa da operação inversa (voltar o
   * status e `$unset` a falha), e em duas escritas existe uma janela em que a tela
   * mostra "processando" com a mensagem de erro anterior ao lado.
   */
  async marcarFalha(
    id: string,
    codigo: string,
    detalhe?: string,
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: HistoricoStatus.Failed,
        falha: { codigo, detalhe },
      })
      .exec();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/historico/historico.schema.spec.ts src/modules/historico/historico.repository.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/historico/types/falha.ts \
        src/modules/historico/historico.schema.ts \
        src/modules/historico/historico.repository.ts \
        src/modules/historico/historico.schema.spec.ts \
        src/modules/historico/historico.repository.spec.ts
git commit -m "feat: Historico registra o motivo da falha, numa escrita só"
```

---

## Task 2: O catálogo e o mapa

**Repo:** ms-simulado

**Files:**
- Create: `src/modules/historico/falha/codigo-falha.ts`, `src/modules/historico/falha/mapa-falha.ts`
- Test: `src/modules/historico/falha/mapa-falha.spec.ts`

- [ ] **Step 1: Write the failing test**

Crie `src/modules/historico/falha/mapa-falha.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { AcaoSugerida, CodigoFalhaInterno } from './codigo-falha';
import { CODIGOS_MAPEADOS, descreverFalha } from './mapa-falha';

describe('mapa de falhas', () => {
  it('cobre os oito códigos do ms-omr e os cinco próprios', () => {
    expect(CODIGOS_MAPEADOS).toEqual(
      expect.arrayContaining([
        // vindos do ms-omr (o README daquele repo é o contrato)
        'imagem_nao_encontrada',
        'template_ausente',
        'cartao_nao_detectado',
        'leitura_ausente',
        'motor_falhou',
        'motor_timeout',
        'armazenamento_indisponivel',
        'erro_interno',
        // produzidos aqui
        'omr_indisponivel',
        'simulado_nao_encontrado',
        'respostas_ausentes',
        'simulado_sem_questoes',
        'erro_no_processamento',
      ]),
    );
    expect(CODIGOS_MAPEADOS).toHaveLength(13);
  });

  it('todo código que este serviço produz está mapeado', () => {
    for (const codigo of Object.values(CodigoFalhaInterno)) {
      expect(CODIGOS_MAPEADOS).toContain(codigo);
    }
  });

  it('descreve a falha sem perder código nem detalhe', () => {
    const d = descreverFalha({
      codigo: 'cartao_nao_detectado',
      detalhe: 'OMRChecker não gerou CSV de Results',
    });
    expect(d).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'OMRChecker não gerou CSV de Results',
      descricao: expect.stringContaining('Não foi possível localizar o cartão'),
      acaoSugerida: AcaoSugerida.ReenviarFoto,
    });
  });

  it('o que não é culpa da foto sugere reprocessar, não refotografar', () => {
    for (const codigo of [
      'motor_timeout',
      'armazenamento_indisponivel',
      'omr_indisponivel',
    ]) {
      expect(descreverFalha({ codigo })!.acaoSugerida).toBe(
        AcaoSugerida.Reprocessar,
      );
    }
  });

  it('nenhuma descrição vaza jargão de OMR para o coordenador', () => {
    for (const codigo of CODIGOS_MAPEADOS) {
      expect(descreverFalha({ codigo })!.descricao).not.toMatch(
        /OMR|CSV|stderr|template\.json/i,
      );
    }
  });

  it('código desconhecido cai no fallback E vai para o log', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const d = descreverFalha({ codigo: 'codigo_que_nao_existe', detalhe: 'x' });

    expect(d).toEqual({
      codigo: 'codigo_que_nao_existe',
      detalhe: 'x',
      descricao: 'Não foi possível ler o cartão.',
      // sem saber o que houve, prometer que tentar de novo resolve seria chute
      acaoSugerida: AcaoSugerida.FalarComSuporte,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('codigo_que_nao_existe'),
    );

    warn.mockRestore();
  });

  it('sem falha, não inventa uma', () => {
    expect(descreverFalha(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/historico/falha/mapa-falha.spec.ts`
Expected: FAIL — `Cannot find module './codigo-falha'`

- [ ] **Step 3: Write the implementation**

Crie `src/modules/historico/falha/codigo-falha.ts`:

```ts
/**
 * O que o cursinho pode fazer a respeito. Valores fechados de propósito: é isto
 * que o card 09 usa para decidir se a ação de reenvio aparece, e é o que mantém
 * a regra num lugar só, em vez de um `if` sobre códigos em cada tela.
 */
export enum AcaoSugerida {
  /** Falhou a infraestrutura, não a imagem — a mesma foto serve numa nova tentativa. */
  Reprocessar = 'reprocessar',
  /** A foto precisa mudar: enquadramento, iluminação, marcadores cortados. */
  ReenviarFoto = 'reenviar_foto',
  /** Nada que o cursinho faça resolve. */
  FalarComSuporte = 'falar_com_suporte',
}

/**
 * Códigos que ESTE serviço produz.
 *
 * Os outros oito chegam do ms-omr e NÃO são enumerados aqui de propósito: validar
 * contra uma lista fechada faria todo código novo daquele repo exigir deploy
 * coordenado. Quem absorve o desconhecido é o fallback do mapa.
 * Contrato do ms-omr: `README.md` de github.com/vcnafacul/ms-omr.
 */
export enum CodigoFalhaInterno {
  OmrIndisponivel = 'omr_indisponivel',
  SimuladoNaoEncontrado = 'simulado_nao_encontrado',
  RespostasAusentes = 'respostas_ausentes',
  SimuladoSemQuestoes = 'simulado_sem_questoes',
  ErroNoProcessamento = 'erro_no_processamento',
}
```

Crie `src/modules/historico/falha/mapa-falha.ts`:

```ts
import { Logger } from '@nestjs/common';
import { FalhaHistorico } from '../types/falha';
import { AcaoSugerida, CodigoFalhaInterno } from './codigo-falha';

const logger = new Logger('MapaFalha');

export interface FalhaDescrita extends FalhaHistorico {
  descricao: string;
  acaoSugerida: AcaoSugerida;
}

interface EntradaMapa {
  descricao: string;
  acaoSugerida: AcaoSugerida;
}

/**
 * Tabela explícita — não `switch` espalhado. As descrições são lidas por um
 * coordenador de cursinho: sem jargão de OMR, e dizendo o que fazer.
 *
 * Os oito primeiros vêm do ms-omr; o contrato é o README daquele repo.
 */
const MAPA: Record<string, EntradaMapa> = {
  imagem_nao_encontrada: {
    descricao: 'A foto do cartão não foi encontrada. Envie novamente.',
    acaoSugerida: AcaoSugerida.ReenviarFoto,
  },
  template_ausente: {
    descricao: 'O modelo de cartão deste simulado não está publicado.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  cartao_nao_detectado: {
    descricao:
      'Não foi possível localizar o cartão na foto. Refotografe com o cartão inteiro visível e boa iluminação.',
    acaoSugerida: AcaoSugerida.ReenviarFoto,
  },
  leitura_ausente: {
    descricao:
      'O cartão foi processado, mas nenhuma marcação foi lida. Refotografe.',
    acaoSugerida: AcaoSugerida.ReenviarFoto,
  },
  motor_falhou: {
    descricao: 'Erro interno na leitura do cartão.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  motor_timeout: {
    descricao:
      'A leitura excedeu o tempo limite depois de três tentativas. Tente processar novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
  armazenamento_indisponivel: {
    descricao:
      'Não foi possível acessar o arquivo do cartão. Tente processar novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
  erro_interno: {
    descricao: 'Erro inesperado ao processar o cartão.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.OmrIndisponivel]: {
    descricao:
      'Não foi possível acionar a leitura do cartão. Tente novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
  [CodigoFalhaInterno.SimuladoNaoEncontrado]: {
    descricao: 'O simulado deste cartão não foi encontrado.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.RespostasAusentes]: {
    descricao:
      'O cartão foi lido, mas nenhuma resposta chegou para o cálculo.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.SimuladoSemQuestoes]: {
    descricao: 'Este simulado não tem questões cadastradas.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.ErroNoProcessamento]: {
    descricao: 'Erro ao calcular o resultado do cartão.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
};

export const CODIGOS_MAPEADOS = Object.keys(MAPA);

/**
 * Código desconhecido não pode virar tela em branco: mostra algo útil e deixa
 * rastro no log, senão um código novo do ms-omr some em silêncio.
 * `FalarComSuporte` é o fallback seguro — sem saber o que houve, prometer que
 * uma segunda tentativa resolve seria chute.
 */
const FALLBACK: EntradaMapa = {
  descricao: 'Não foi possível ler o cartão.',
  acaoSugerida: AcaoSugerida.FalarComSuporte,
};

export function descreverFalha(
  falha?: FalhaHistorico,
): FalhaDescrita | undefined {
  if (!falha) return undefined;

  const entrada = MAPA[falha.codigo];
  if (!entrada) {
    logger.warn(`código de falha não mapeado: ${falha.codigo}`);
    return { ...falha, ...FALLBACK };
  }
  return { ...falha, ...entrada };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/historico/falha/mapa-falha.spec.ts`
Expected: PASS — 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/modules/historico/falha/
git commit -m "feat: mapa código → descrição + acaoSugerida, com fallback logado"
```

---

## Task 3: A descrição nasce na leitura

**Repo:** ms-simulado

**Files:**
- Modify: `src/modules/historico/historico.service.ts`
- Test: `src/modules/historico/historico.service.spec.ts`

⚠️ Note o nome do método na service: `getAllbyUser`, com **b minúsculo** — o do repositório é
`getAllByUser`. Não é typo seu.

- [ ] **Step 1: Write the failing test**

Acrescente a `src/modules/historico/historico.service.spec.ts` (mantenha os imports que já
existirem no topo e acrescente os que faltarem):

```ts
import { HistoricoService } from './historico.service';

describe('HistoricoService — descrição da falha (card 01)', () => {
  it('getAllbyUser descreve a falha de cada histórico', async () => {
    const repository = {
      getAllByUser: jest.fn().mockResolvedValue({
        data: [
          { _id: 'h1', falha: { codigo: 'cartao_nao_detectado', detalhe: 'x' } },
          { _id: 'h2' },
        ],
        page: 1,
        limit: 10,
        totalItems: 2,
      }),
    };
    const svc = new HistoricoService(repository as any);

    const r: any = await svc.getAllbyUser({ page: 1, limit: 10 } as any);

    expect(r.data[0].falha).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'x',
      descricao: expect.stringContaining('Não foi possível localizar o cartão'),
      acaoSugerida: 'reenviar_foto',
    });
    // histórico sem falha continua sem falha — não se inventa uma
    expect(r.data[1].falha).toBeUndefined();
    // e a paginação sobrevive
    expect(r.totalItems).toBe(2);
  });

  it('getById descreve a falha', async () => {
    const repository = {
      getById: jest.fn().mockResolvedValue({
        _id: 'h1',
        falha: { codigo: 'motor_timeout' },
      }),
    };
    const svc = new HistoricoService(repository as any);

    const r: any = await svc.getById('h1');

    expect(r.falha.acaoSugerida).toBe('reprocessar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/historico/historico.service.spec.ts`
Expected: FAIL — `r.data[0].falha` ainda é `{ codigo, detalhe }`, sem `descricao`

- [ ] **Step 3: Write the implementation**

Em `src/modules/historico/historico.service.ts`, acrescente o import:

```ts
import { descreverFalha } from './falha/mapa-falha';
```

Substitua `getAllbyUser` por:

```ts
  async getAllbyUser(dto: GetHistoricoDTOInput) {
    const resultado = await this.repository.getAllByUser(dto);
    return {
      ...resultado,
      data: resultado.data.map((historico) => {
        const obj: any = (historico as any).toObject
          ? (historico as any).toObject()
          : historico;
        return { ...obj, falha: descreverFalha(obj.falha) };
      }),
    };
  }
```

E em `getById`, logo antes do `return obj;` final, acrescente:

```ts
    obj.falha = descreverFalha(obj.falha);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/historico/historico.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/historico/historico.service.ts \
        src/modules/historico/historico.service.spec.ts
git commit -m "feat: service descreve a falha na leitura, sem gravar o texto"
```

---

## Task 4: Os três pontos do fluxo de cartão

**Repo:** ms-simulado

**Files:**
- Modify: `src/modules/cartao-resposta/cartao-callback.service.ts` (o `if (input.falha)` e o
  ramo "simulado não encontrado"), `src/modules/cartao-resposta/cartao-historico.service.ts`
  (o `catch` do `enviarProcessamento`),
  `src/modules/cartao-resposta/dtos/cartao-callback.dto.input.ts`
- Test: `src/modules/cartao-resposta/cartao-callback.service.spec.ts`,
  `src/modules/cartao-resposta/cartao-historico.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Em `src/modules/cartao-resposta/cartao-callback.service.spec.ts`, acrescente `marcarFalha` ao
dublê do repositório dentro de `setup`:

```ts
    marcarFalha: jest.fn().mockResolvedValue(undefined),
```

Substitua o teste existente `'falha: marca Failed, sem publish'` por:

```ts
  it('falha: grava o código recebido e o detalhe, sem publish', async () => {
    const { svc, historicoRepository, queueProducer } = setup();

    await svc.processar({
      imageKey: 'k',
      falha: { motivo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
    });

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'cartao_nao_detectado',
      'sem CSV',
    );
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('falha: repassa código desconhecido cru, sem validar contra lista fechada', async () => {
    // validar aqui faria todo código novo do ms-omr exigir deploy coordenado;
    // quem absorve o desconhecido é o fallback do mapa, na leitura
    const { svc, historicoRepository } = setup();

    await svc.processar({
      imageKey: 'k',
      falha: { motivo: 'codigo_futuro_do_ms_omr' },
    });

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'codigo_futuro_do_ms_omr',
      undefined,
    );
  });

  it('simulado não encontrado: grava o motivo, não só o status', async () => {
    const { svc, historicoRepository } = setup({
      simuladoRepository: { answer: jest.fn().mockResolvedValue(null) },
    });

    await svc.processar({ imageKey: 'k', respostas: [] });

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'simulado_nao_encontrado',
      expect.any(String),
    );
  });

  it('callback sem falha não inventa uma', async () => {
    const { svc, historicoRepository } = setup();

    await svc.processar({
      imageKey: 'k',
      respostas: [{ questao: '1', alternativaEstudante: 'A' }],
    });

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
  });
```

Em `src/modules/cartao-resposta/cartao-historico.service.spec.ts`, acrescente (ajustando o helper
de setup que já existir no arquivo para incluir `marcarFalha: jest.fn()` no dublê do repositório):

```ts
  it('OMR inacessível: grava omr_indisponivel, não só o status', async () => {
    const historicoRepository = {
      existsCartaoAtivo: jest.fn().mockResolvedValue(false),
      createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const omrHttp = {
      enviarProcessamento: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const svc = new CartaoHistoricoService(
      historicoRepository as any,
      omrHttp as any,
    );

    await expect(
      svc.criar({
        usuario: 'u1',
        imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
        cartaoCode: '7',
      }),
    ).rejects.toThrow();

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'omr_indisponivel',
      expect.any(String),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/cartao-resposta/cartao-callback.service.spec.ts src/modules/cartao-resposta/cartao-historico.service.spec.ts`
Expected: FAIL — `marcarFalha` nunca é chamado; os serviços ainda usam `updateStatus`

- [ ] **Step 3: Write the implementation**

Em `src/modules/cartao-resposta/cartao-callback.service.ts`, acrescente o import:

```ts
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
```

Substitua o bloco `if (input.falha)` por:

```ts
    if (input.falha) {
      // o código vem cru do ms-omr de propósito: validar contra uma lista fechada
      // faria todo código novo daquele repo exigir deploy coordenado
      await this.historicoRepository.marcarFalha(
        histId,
        input.falha.motivo,
        input.falha.detalhe,
      );
      return;
    }
```

Substitua o bloco `if (!simulado)` por:

```ts
    if (!simulado) {
      this.logger.warn(
        `callback: simulado ${simuladoId} não encontrado (histórico ${histId}) → Failed`,
      );
      await this.historicoRepository.marcarFalha(
        histId,
        CodigoFalhaInterno.SimuladoNaoEncontrado,
        `simulado ${simuladoId} não encontrado`,
      );
      return;
    }
```

Se `HistoricoStatus` deixar de ser usado no arquivo, remova o import — o lint reclama.

Em `src/modules/cartao-resposta/cartao-historico.service.ts`, acrescente o import:

```ts
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
```

e substitua o `try/catch` do `enviarProcessamento` por:

```ts
    try {
      await this.omrHttp.enviarProcessamento(dto.imageKey);
    } catch (err) {
      await this.historicoRepository.marcarFalha(
        historicoId,
        CodigoFalhaInterno.OmrIndisponivel,
        err instanceof Error ? err.message : String(err),
      );
      throw new BadGatewayException('falha ao acionar o OMR');
    }
```

Novamente, remova o import de `HistoricoStatus` se ele ficar sem uso.

Em `src/modules/cartao-resposta/dtos/cartao-callback.dto.input.ts`, substitua o arquivo inteiro por:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CartaoCallbackFalhaDtoInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  motivo: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  detalhe?: string;
}

export class CartaoCallbackDtoInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageKey: string;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  respostas?: { questao: string; alternativaEstudante: string }[];

  @ApiProperty({ required: false, type: CartaoCallbackFalhaDtoInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => CartaoCallbackFalhaDtoInput)
  falha?: CartaoCallbackFalhaDtoInput;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/cartao-resposta/`
Expected: PASS — toda a pasta verde

- [ ] **Step 5: Commit**

```bash
git add src/modules/cartao-resposta/cartao-callback.service.ts \
        src/modules/cartao-resposta/cartao-historico.service.ts \
        src/modules/cartao-resposta/dtos/cartao-callback.dto.input.ts \
        src/modules/cartao-resposta/cartao-callback.service.spec.ts \
        src/modules/cartao-resposta/cartao-historico.service.spec.ts
git commit -m "feat: os três pontos de falha do fluxo de cartão gravam motivo"
```

---

## Task 5: Os três pontos do estágio de processamento

**Repo:** ms-simulado

**Files:**
- Modify: `src/modules/simulado/simulado.service.ts` (`processAnswer` — os três
  `updateStatus(..., Failed)`)
- Test: `src/modules/simulado/simulado.service.spec.ts`

Estes três não estavam no card. Produzem o mesmo sintoma — `failed` pelado — e atingem também o
fluxo online, não só o cartão.

- [ ] **Step 1: Write the failing tests**

Acrescente ao final de `src/modules/simulado/simulado.service.spec.ts`.

O arquivo já tem um helper `makeService(simuladoRepo)`, mas ele só injeta o `simuladoRepository` —
`processAnswer` precisa também do `historicoRepository` e do `questoesRepository`. Por isso este
bloco monta o serviço direto. A ordem do construtor é
`(simuladoRepository, questoesRepository, categoriaRepository, historicoRepository, materiaRepository, queueProducer)`.

```ts
describe('SimuladoService.processAnswer — motivo da falha (card 01)', () => {
  const montar = (over: any = {}) => {
    const historicoRepository = {
      claimForProcessing: jest.fn().mockResolvedValue(true),
      getById: jest.fn().mockResolvedValue({
        rawRespostas: [{ questao: 'q1', alternativaEstudante: 'A' }],
        simulado: { _id: 's1' },
      }),
      completeProcessing: jest.fn().mockResolvedValue(undefined),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
      ...over.historicoRepository,
    };
    const simuladoRepository = {
      answer: jest.fn().mockResolvedValue({
        questoes: [{ numero: 1, questao: { _id: 'q1', alternativa: 'A' } }],
      }),
      ...over.simuladoRepository,
    };
    const questoesRepository = {
      findAnoByQuestao: jest.fn().mockResolvedValue(2025),
      updateQuestionAnswered: jest.fn().mockResolvedValue(undefined),
      ...over.questoesRepository,
    };
    const service = new SimuladoService(
      simuladoRepository as any, // simuladoRepository
      questoesRepository as any, // questoesRepository
      {} as any, // categoriaRepository
      historicoRepository as any, // historicoRepository
      {} as any, // materiaRepository
      {} as any, // queueProducer
    );
    return { service, historicoRepository, simuladoRepository };
  };

  it('sem rawRespostas grava respostas_ausentes', async () => {
    const { service, historicoRepository } = montar({
      historicoRepository: {
        getById: jest.fn().mockResolvedValue({ simulado: { _id: 's1' } }),
      },
    });

    await service.processAnswer('h1');

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'respostas_ausentes',
      expect.any(String),
    );
  });

  it('simulado sem questões grava simulado_sem_questoes', async () => {
    const { service, historicoRepository } = montar({
      simuladoRepository: {
        answer: jest.fn().mockResolvedValue({ questoes: [] }),
      },
    });

    await service.processAnswer('h1');

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'simulado_sem_questoes',
      expect.any(String),
    );
  });

  it('erro inesperado grava erro_no_processamento com a mensagem no detalhe', async () => {
    const { service, historicoRepository } = montar({
      simuladoRepository: {
        answer: jest.fn().mockRejectedValue(new Error('mongo caiu')),
      },
    });

    await expect(service.processAnswer('h1')).rejects.toThrow('mongo caiu');

    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      'erro_no_processamento',
      'mongo caiu',
    );
  });

  it('caminho feliz não grava falha nenhuma', async () => {
    const { service, historicoRepository } = montar();

    await service.processAnswer('h1');

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
    expect(historicoRepository.completeProcessing).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/simulado/simulado.service.spec.ts`
Expected: FAIL — `marcarFalha` nunca é chamado; o serviço ainda usa `updateStatus`

- [ ] **Step 3: Write the implementation**

Em `src/modules/simulado/simulado.service.ts`, acrescente o import:

```ts
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
```

Substitua o guard de `rawRespostas` por:

```ts
      if (!historico?.rawRespostas) {
        await this.historicoRepository.marcarFalha(
          histId,
          CodigoFalhaInterno.RespostasAusentes,
          'histórico sem rawRespostas para processar',
        );
        return;
      }
```

Substitua o guard de questões por:

```ts
      if (!simulado.questoes.length) {
        await this.historicoRepository.marcarFalha(
          histId,
          CodigoFalhaInterno.SimuladoSemQuestoes,
          `simulado ${simuladoId} sem questões`,
        );
        return;
      }
```

Substitua o `catch` final por:

```ts
    } catch (err) {
      await this.historicoRepository.marcarFalha(
        histId,
        CodigoFalhaInterno.ErroNoProcessamento,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
```

Se `HistoricoStatus` ficar sem uso no arquivo, remova o import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/simulado/simulado.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Rode a suíte inteira do ms e o lint**

```bash
npm test
npx eslint "src/**/*.ts"
```

⚠️ Use `npx eslint`, **não** `npm run lint`: o script do repo tem `--fix` e reformata arquivos
alheios à sua mudança.

Expected: suíte verde, lint sem achados nos arquivos que você tocou.

- [ ] **Step 6: Commit**

```bash
git add src/modules/simulado/simulado.service.ts \
        src/modules/simulado/simulado.service.spec.ts
git commit -m "feat: o estágio de processamento também grava o motivo da falha"
```

---

## Task 6: O client mostra o motivo

**Repo:** client-vcnafacul — **outro repositório**

- [ ] **Step 1: Crie a branch**

```bash
cd ../client-vcnafacul
git checkout -b feature/01-motivo-da-falha-do-cartao
```

**Files:**
- Modify: `src/dtos/cartaoResposta/resultados.ts`,
  `src/pages/dashProvas/modals/uploadCartaoModal.tsx`
- Create: `src/pages/dashProvas/modals/uploadCartaoModal.test.tsx`

- [ ] **Step 2: Write the failing test**

Crie `src/pages/dashProvas/modals/uploadCartaoModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/* -------------------------------------------------------------------------- *
 * O que está sob teste é o canal de volta: a lista de históricos do aluno é
 * onde o coordenador descobre POR QUE um cartão falhou. Serviços e o template
 * do modal entram como dublês.
 * -------------------------------------------------------------------------- */

const buscarResultados = vi.hoisted(() => vi.fn());
const uploadCartao = vi.hoisted(() => vi.fn(async () => undefined));
const toastUpdate = vi.hoisted(() => vi.fn());

vi.mock("../../../services/cartaoResposta/buscarResultados", () => ({
  buscarResultados,
}));
vi.mock("../../../services/cartaoResposta/uploadCartao", () => ({
  uploadCartao,
}));
vi.mock("react-toastify", () => ({
  toast: { loading: vi.fn(() => 1), update: toastUpdate, error: vi.fn() },
}));
vi.mock("../../../components/templates/modalTemplate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import UploadCartaoModal from "./uploadCartaoModal";

const abrirEBuscar = async (historicos: unknown[]) => {
  buscarResultados.mockResolvedValue({
    estudante: { userId: "u1", nome: "Ana Silva", matricula: "2025001" },
    historicos,
  });
  render(<UploadCartaoModal isOpen handleClose={vi.fn()} token="t" />);
  fireEvent.change(screen.getByPlaceholderText(/Matrícula/i), {
    target: { value: "2025001" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Buscar/i }));
  await screen.findByText("Ana Silva");
};

describe("UploadCartaoModal — o motivo da falha", () => {
  it("mostra a descrição da falha em vez do status cru", async () => {
    await abrirEBuscar([
      {
        ano: 2025,
        status: "failed",
        falha: {
          codigo: "cartao_nao_detectado",
          descricao:
            "Não foi possível localizar o cartão na foto. Refotografe com o cartão inteiro visível e boa iluminação.",
          acaoSugerida: "reenviar_foto",
        },
      },
    ]);

    expect(
      screen.getByText(/Não foi possível localizar o cartão na foto/),
    ).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  it("sem falha, mostra o status como antes", async () => {
    await abrirEBuscar([{ ano: 2024, status: "completed" }]);

    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("o toast não afirma que o processamento deu certo", async () => {
    await abrirEBuscar([]);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "c.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cartão/i }));

    await vi.waitFor(() => expect(toastUpdate).toHaveBeenCalled());
    const render_ = toastUpdate.mock.calls[0][1].render as string;
    // o sucesso era do UPLOAD, não da leitura
    expect(render_).not.toMatch(/Processando/i);
    expect(render_).toMatch(/quando o processamento terminar/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/pages/dashProvas/modals/uploadCartaoModal.test.tsx`
Expected: FAIL — a lista mostra `"failed"` e o toast diz `"Cartão enviado! Processando..."`

- [ ] **Step 4: Write the implementation**

Substitua `src/dtos/cartaoResposta/resultados.ts` por:

```ts
export interface EstudanteCartao {
  userId: string;
  nome: string;
  matricula: string;
}

/** Espelha o `acaoSugerida` do ms-simulado (`historico/falha/codigo-falha.ts`). */
export type AcaoSugerida = "reprocessar" | "reenviar_foto" | "falar_com_suporte";

/**
 * A `descricao` e a `acaoSugerida` são derivadas do código pelo ms-simulado.
 * O client NÃO conhece código de erro — e é isso que permite mudar um texto
 * ou uma ação sem tocar em nenhuma tela.
 */
export interface FalhaHistorico {
  codigo: string;
  detalhe?: string;
  descricao: string;
  acaoSugerida: AcaoSugerida;
}

export interface HistoricoResumo {
  ano?: number;
  status?: string;
  falha?: FalhaHistorico;
}

export interface ResultadosCartao {
  estudante: EstudanteCartao;
  historicos: HistoricoResumo[];
}
```

Em `src/pages/dashProvas/modals/uploadCartaoModal.tsx`, substitua o corpo do `toast.update` de
sucesso:

```tsx
      toast.update(id, {
        render:
          "Cartão enviado. O resultado aparece aqui quando o processamento terminar.",
        type: "info",
        isLoading: false,
        autoClose: 5000,
        closeOnClick: true,
      });
```

e substitua o `<li>` da lista de históricos por:

```tsx
                {resultado.historicos.map((h, i) => (
                  <li key={i} className="py-1 flex justify-between gap-3">
                    <span className="shrink-0">{h.ano ?? "—"}</span>
                    <span
                      className={
                        h.falha
                          ? "text-right text-red-600"
                          : "text-right text-gray-500"
                      }
                    >
                      {h.falha ? h.falha.descricao : (h.status ?? "")}
                    </span>
                  </li>
                ))}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/dashProvas/modals/uploadCartaoModal.test.tsx`
Expected: PASS — 3 passed

- [ ] **Step 6: Rode a suíte e o lint do client**

```bash
npm test
npm run lint
```

Expected: suíte verde; lint com zero warnings (o repo usa `--max-warnings 0`).

- [ ] **Step 7: Commit**

```bash
git add src/dtos/cartaoResposta/resultados.ts \
        src/pages/dashProvas/modals/uploadCartaoModal.tsx \
        src/pages/dashProvas/modals/uploadCartaoModal.test.tsx
git commit -m "feat: a lista do modal mostra o motivo da falha, e o toast para de mentir"
```

---

## Verificação final

- [ ] ms-simulado: `npm test` verde, `npx eslint "src/**/*.ts"` sem achados
- [ ] client: `npm test` e `npm run lint` verdes
- [ ] `grep -rn "HistoricoStatus.Failed" ms-simulado/src --include=*.ts | grep -v spec` devolve
      **apenas** a linha dentro de `marcarFalha` no repositório
- [ ] `git status` em ambos os repos não mostra arquivos alheios no stage
- [ ] O `enem_2010_2016_factory.spec.ts` do ms-simulado continua **não commitado**

## Dependência que este plano cria

⚠️ O card `02`, ao criar a consulta de históricos por simulado, **precisa chamar `descreverFalha`**
antes de devolver as linhas. Sem isso a coluna de erro dos cards `05`/`06` chega com o código cru
em vez da descrição. Não há nada no código que force isso — é a contrapartida de derivar na service
em vez de num virtual do Mongoose.

## Deploy

**ms-simulado → client.** A api não muda. Campo novo e opcional, **sem migração**.

⚠️ Históricos que já falharam ficam sem `falha` para sempre — a informação nunca existiu e não é
reconstruível. A lista mostra o status cru neles, como hoje.
