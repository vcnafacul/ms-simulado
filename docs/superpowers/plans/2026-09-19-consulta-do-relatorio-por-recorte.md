# A consulta do relatório por recorte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao cursinho a consulta que o relatório de um simulado precisa — as linhas daquele simulado restritas ao seu cursinho, opcionalmente a uma turma, com a falha já traduzida para uma frase que um coordenador entende.

**Architecture:** O módulo `relatorio-simulado-estudante`, que hoje só escreve, ganha leitura: o repositório consulta a junção com `populate` seletivo no `Historico`, o serviço passa cada linha por `descreverFalha` e monta o DTO de saída, e o controller expõe `GET /v1/relatorio-simulado/:simuladoId`. O recorte é imposto no Mongo, nunca na api.

**Tech Stack:** NestJS 10 + Mongoose, Jest.

**Spec:** `docs/superpowers/specs/2026-09-19-consulta-do-relatorio-por-recorte-design.md`
**Card:** `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/02-BACK-historicos-por-simulado-restritos-a-usuarios.md`

**Repo:** `ms-simulado` · **Branch:** `feature/02-consulta-relatorio-por-recorte` (já criada, spec já commitado)

Tests: `npx jest <path>` e `npm test`. Lint: `npx eslint <arquivos>` — **nunca `npm run lint`**, ele carrega `--fix` e reformata o repo inteiro. Working tree limpa; **adicione arquivos por nome** no commit, nunca `git add -A`.

---

## Estrutura de arquivos

| arquivo | responsabilidade | ação |
|---|---|---|
| `src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.ts` | Valida `cursinhoId` (obrigatório) e `turmaId` (opcional) | **criar** |
| `src/modules/relatorio-simulado-estudante/dtos/relatorio-simulado.dto.output.ts` | A forma que os cards `04`–`07` consomem | **criar** |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts` | Ganha `buscarPorRecorte` e `contarDoCursinho` | modificar |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts` | Aplica `descreverFalha` e monta a saída | **criar** |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts` | `GET /v1/relatorio-simulado/:simuladoId` | **criar** |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts` | Registra controller e service | modificar |
| `src/app.module.ts` | Importa o módulo direto, não só via cartão | modificar |
| `package.json` | `mongodb-memory-server` em `devDependencies` (Task 4) | modificar |

⚠️ **Por que `app.module.ts` muda.** Hoje `RelatorioSimuladoEstudanteModule` só é alcançado por
`CartaoRespostaModule`. As rotas até seriam registradas por transitividade, mas isso amarra a
existência do endpoint de relatório a um detalhe de outro módulo: quem remover aquele import faz a
rota sumir sem nenhum teste ficar vermelho.

---

## Task 1: As duas consultas no repositório

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.spec.ts`

- [ ] **Step 1: Write the failing tests**

Acrescente ao final de `relatorio-simulado-estudante.repository.spec.ts` (o arquivo já importa
`Types` e o repositório):

```ts
describe('RelatorioSimuladoEstudanteRepository.buscarPorRecorte', () => {
  const montarBusca = () => {
    const chain: any = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.lean = jest.fn().mockReturnValue(chain);
    chain.exec = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue(chain);
    const repo = new RelatorioSimuladoEstudanteRepository({ find } as any);
    return { repo, find, chain };
  };

  it('filtra por simulado e cursinho', async () => {
    const { repo, find } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const filtro = find.mock.calls[0][0];
    expect(filtro.simulado).toBeInstanceOf(Types.ObjectId);
    expect(filtro.simulado.toString()).toBe(SIM);
    expect(filtro.cursinhoId).toBe('cur-1');
  });

  it('sem turmaId, a chave nem aparece no filtro', async () => {
    // ⚠️ ERRATA (revisão adversarial, Fix 2): a premissa abaixo estava
    // invertida. Medido num Mongo de verdade, `{ turmaId: undefined }` vira
    // `{ turmaId: null }` e casa SÓ quem NÃO tem turma — não "todos". A guarda
    // continua necessária, só que pelo motivo oposto: sem ela, a visão do
    // cursinho inteiro perderia todo mundo COM turma.
    // { turmaId: undefined } no Mongo casa TODOS os documentos, não os sem turma
    const { repo, find } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect('turmaId' in find.mock.calls[0][0]).toBe(false);
  });

  it('com turmaId, restringe à turma', async () => {
    const { repo, find } = montarBusca();

    await repo.buscarPorRecorte({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    expect(find.mock.calls[0][0].turmaId).toBe('t-1');
  });

  it('popula o histórico com select explícito, não o documento inteiro', async () => {
    // respostas de 90 questões × 500 estudantes é carga que nenhuma tela desta série usa
    const { repo, chain } = montarBusca();

    await repo.buscarPorRecorte({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const populate = chain.populate.mock.calls[0][0];
    expect(populate.path).toBe('historico');
    expect(populate.select).toEqual(
      expect.stringContaining('aproveitamento.geral'),
    );
    expect(populate.select).not.toContain('respostas');
  });
});

describe('RelatorioSimuladoEstudanteRepository.contarDoCursinho', () => {
  it('conta escopado no cursinho, nunca global', async () => {
    const countDocuments = jest.fn().mockResolvedValue(30);
    const repo = new RelatorioSimuladoEstudanteRepository({
      countDocuments,
    } as any);

    const total = await repo.contarDoCursinho(SIM, 'cur-1');

    expect(total).toBe(30);
    const filtro = countDocuments.mock.calls[0][0];
    expect(filtro.cursinhoId).toBe('cur-1');
    expect(filtro.simulado.toString()).toBe(SIM);
    // sem o cursinho, o número diria a um cursinho quantos cartões os outros enviaram
    expect(Object.keys(filtro).sort()).toEqual(['cursinhoId', 'simulado']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: FAIL — `repo.buscarPorRecorte is not a function`

- [ ] **Step 3: Write the implementation**

Em `relatorio-simulado-estudante.repository.ts`, acrescente o import do schema do histórico e os dois
métodos depois de `registrar`:

```ts
import { Historico } from '../historico/historico.schema';
```

```ts
/**
 * Só o que as telas dos cards 04–07 usam. `respostas` fica de fora de propósito:
 * 90 questões × centenas de estudantes é carga que nenhuma delas lê. O card 07
 * busca o histórico por id quando precisar do detalhe.
 */
const CAMPOS_DO_HISTORICO =
  'status cartaoCode questoesRespondidas aproveitamento.geral falha';
```

```ts
  /**
   * As linhas de um simulado dentro de um recorte. O recorte é imposto AQUI, no
   * Mongo — trazer tudo e filtrar do outro lado transporta dados de outros
   * cursinhos pela rede interna e não escala.
   */
  async buscarPorRecorte(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<(RelatorioSimuladoEstudante & { historico: Historico })[]> {
    const filtro: Record<string, unknown> = {
      simulado: new Types.ObjectId(params.simuladoId),
      cursinhoId: params.cursinhoId,
    };
    // ⚠️ ERRATA (Fix 2): `{ turmaId: undefined }` vira `{ turmaId: null }` e
    // casa SÓ quem não tem turma — a visão do cursinho inteiro perderia todo
    // mundo COM turma. Ver correção no código-fonte e no spec de design.
    if (params.turmaId !== undefined) {
      filtro.turmaId = params.turmaId;
    }

    return this.model
      .find(filtro)
      .populate({ path: 'historico', select: CAMPOS_DO_HISTORICO })
      .lean()
      .exec() as unknown as Promise<
      (RelatorioSimuladoEstudante & { historico: Historico })[]
    >;
  }

  /**
   * Quantos cartões deste simulado o cursinho enviou. Alimenta o rodapé do
   * relatório por turma — "27 dos 30 cartões deste simulado são desta turma".
   *
   * ⚠️ Escopado no cursinho, nunca global: um `countDocuments({ simulado })`
   * diria a um cursinho quantos cartões os outros enviaram.
   */
  async contarDoCursinho(
    simuladoId: string,
    cursinhoId: string,
  ): Promise<number> {
    return this.model.countDocuments({
      simulado: new Types.ObjectId(simuladoId),
      cursinhoId,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.spec.ts
git commit -m "feat: consulta por recorte e contagem escopada no cursinho"
```

---

## Task 2: O serviço descreve a falha e monta a saída

**Files:**
- Create: `src/modules/relatorio-simulado-estudante/dtos/relatorio-simulado.dto.output.ts`, `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`:

```ts
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

const SIM = '665f0c1a2b3c4d5e6f00abc2';

const linha = (over: any = {}) => ({
  usuario: 'u1',
  turmaId: 't-1',
  historico: {
    _id: 'h1',
    status: 'completed',
    cartaoCode: '7',
    questoesRespondidas: 90,
    aproveitamento: { geral: 0.72 },
    ...over.historico,
  },
  ...over,
});

const montar = (linhas: any[], total = 30) => {
  const repository = {
    buscarPorRecorte: jest.fn().mockResolvedValue(linhas),
    contarDoCursinho: jest.fn().mockResolvedValue(total),
  };
  return {
    svc: new RelatorioSimuladoEstudanteService(repository as any),
    repository,
  };
};

describe('RelatorioSimuladoEstudanteService.consultar', () => {
  it('monta a linha do estudante com o que as telas usam', async () => {
    const { svc } = montar([linha()]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas[0]).toEqual({
      usuario: 'u1',
      turmaId: 't-1',
      historicoId: 'h1',
      status: 'completed',
      cartaoCode: '7',
      questoesRespondidas: 90,
      aproveitamentoGeral: 0.72,
      falha: undefined,
    });
    expect(r.totalEstudantesComCartaoNoCursinho).toBe(30);
  });

  it('traduz a falha — a tela recebe a frase, não o código', async () => {
    const { svc } = montar([
      linha({
        historico: {
          status: 'failed',
          falha: { codigo: 'cartao_nao_detectado', detalhe: 'sem CSV' },
        },
      }),
    ]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas[0].falha).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'sem CSV',
      descricao: expect.stringContaining('Não foi possível localizar o cartão'),
      acaoSugerida: 'reenviar_foto',
    });
  });

  it('cartão que ainda não foi lido vem SEM aproveitamento, não com zero', async () => {
    // zero é uma nota; ausência de leitura não é. Iguais, a média do card 04 mente.
    const { svc } = montar([
      linha({
        historico: {
          status: 'awaiting_omr',
          questoesRespondidas: undefined,
          aproveitamento: undefined,
        },
      }),
    ]);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas[0].aproveitamentoGeral).toBeUndefined();
    expect(r.linhas[0].status).toBe('awaiting_omr');
  });

  it('repassa o recorte ao repositório, incluindo a turma', async () => {
    const { svc, repository } = montar([]);

    await svc.consultar({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });

    expect(repository.buscarPorRecorte).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });
    // a contagem é do CURSINHO, não da turma — é o denominador do rodapé
    expect(repository.contarDoCursinho).toHaveBeenCalledWith(SIM, 'cur-1');
  });

  it('recorte sem cartão nenhum devolve lista vazia, não erro', async () => {
    const { svc } = montar([], 0);

    const r = await svc.consultar({ simuladoId: SIM, cursinhoId: 'cur-1' });

    expect(r.linhas).toEqual([]);
    expect(r.totalEstudantesComCartaoNoCursinho).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`
Expected: FAIL — `Cannot find module './relatorio-simulado-estudante.service'`

- [ ] **Step 3: Write the implementation**

Criar `src/modules/relatorio-simulado-estudante/dtos/relatorio-simulado.dto.output.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { FalhaDescrita } from '../../historico/falha/mapa-falha';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';

export class LinhaRelatorioDtoOutput {
  @ApiProperty() usuario: string;

  @ApiProperty({ required: false }) turmaId?: string;

  /** O card 07 usa para abrir o detalhe do estudante. */
  @ApiProperty() historicoId: string;

  @ApiProperty({ enum: HistoricoStatus }) status: HistoricoStatus;

  @ApiProperty({ required: false }) cartaoCode?: string;

  @ApiProperty({ required: false }) questoesRespondidas?: number;

  /**
   * AUSENTE, não zero, quando não há leitura concluída. Zero é uma nota;
   * ausência de leitura não é — iguais, a média do card 04 mente.
   */
  @ApiProperty({ required: false }) aproveitamentoGeral?: number;

  @ApiProperty({ required: false }) falha?: FalhaDescrita;
}

export class RelatorioSimuladoDtoOutput {
  @ApiProperty({ type: [LinhaRelatorioDtoOutput] })
  linhas: LinhaRelatorioDtoOutput[];

  /**
   * Cartões deste simulado no cursinho inteiro. Denominador do rodapé do
   * relatório por turma: "27 dos 30 cartões deste simulado são desta turma".
   * No relatório geral do cursinho é sempre igual a `linhas.length`.
   */
  @ApiProperty()
  totalEstudantesComCartaoNoCursinho: number;
}
```

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { descreverFalha } from '../historico/falha/mapa-falha';
import {
  LinhaRelatorioDtoOutput,
  RelatorioSimuladoDtoOutput,
} from './dtos/relatorio-simulado.dto.output';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';

@Injectable()
export class RelatorioSimuladoEstudanteService {
  constructor(
    private readonly repository: RelatorioSimuladoEstudanteRepository,
  ) {}

  async consultar(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<RelatorioSimuladoDtoOutput> {
    const [linhas, total] = await Promise.all([
      this.repository.buscarPorRecorte(params),
      // do CURSINHO, não da turma: é o denominador do rodapé
      this.repository.contarDoCursinho(params.simuladoId, params.cursinhoId),
    ]);

    return {
      linhas: linhas.map((l) => this.montarLinha(l)),
      totalEstudantesComCartaoNoCursinho: total,
    };
  }

  /**
   * ⚠️ `descreverFalha` é chamado AQUI, e nada no código força isso — é a
   * contrapartida de o card 01 derivar a descrição na service em vez de num
   * virtual do Mongoose. Sem ele a tela recebe `cartao_nao_detectado` cru.
   */
  private montarLinha(l: any): LinhaRelatorioDtoOutput {
    const h = l.historico;
    return {
      usuario: l.usuario,
      turmaId: l.turmaId,
      historicoId: h._id.toString(),
      status: h.status,
      cartaoCode: h.cartaoCode,
      questoesRespondidas: h.questoesRespondidas,
      // ausente, não zero — ver o docblock do DTO
      aproveitamentoGeral: h.aproveitamento?.geral,
      falha: descreverFalha(h.falha),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/dtos/relatorio-simulado.dto.output.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts
git commit -m "feat: serviço do relatório traduz a falha e monta a saída"
```

---

## Task 3: A rota

**Files:**
- Create: `src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.ts`, `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts`
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts`, `src/app.module.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts`, `src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.spec.ts`

- [ ] **Step 1: Write the failing tests**

Criar `src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConsultarRelatorioDtoInput } from './consultar-relatorio.dto.input';

const validar = (query: unknown) =>
  validateSync(plainToInstance(ConsultarRelatorioDtoInput, query) as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

describe('ConsultarRelatorioDtoInput', () => {
  it('aceita só o cursinho', () => {
    expect(validar({ cursinhoId: 'cur-1' })).toHaveLength(0);
  });

  it('aceita cursinho e turma', () => {
    expect(validar({ cursinhoId: 'cur-1', turmaId: 't-1' })).toHaveLength(0);
  });

  it('RECUSA sem cursinhoId — senão a rota viraria "todos os cursinhos"', () => {
    expect(validar({}).length).toBeGreaterThan(0);
    expect(validar({ turmaId: 't-1' }).length).toBeGreaterThan(0);
  });

  it('recusa cursinhoId vazio', () => {
    expect(validar({ cursinhoId: '' }).length).toBeGreaterThan(0);
  });
});
```

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts`:

```ts
import { RelatorioSimuladoEstudanteController } from './relatorio-simulado-estudante.controller';

const SIM = '665f0c1a2b3c4d5e6f00abc2';

describe('RelatorioSimuladoEstudanteController', () => {
  it('repassa simulado, cursinho e turma ao serviço', async () => {
    const service = {
      consultar: jest
        .fn()
        .mockResolvedValue({ linhas: [], totalEstudantesComCartaoNoCursinho: 0 }),
    };
    const ctrl = new RelatorioSimuladoEstudanteController(service as any);

    await ctrl.consultar(SIM, {
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    } as any);

    expect(service.consultar).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('sem turma, não inventa uma', async () => {
    const service = {
      consultar: jest
        .fn()
        .mockResolvedValue({ linhas: [], totalEstudantesComCartaoNoCursinho: 0 }),
    };
    const ctrl = new RelatorioSimuladoEstudanteController(service as any);

    await ctrl.consultar(SIM, { cursinhoId: 'cur-1' } as any);

    expect(service.consultar).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: undefined,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: FAIL — `Cannot find module './consultar-relatorio.dto.input'`

- [ ] **Step 3: Write the implementation**

Criar `src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConsultarRelatorioDtoInput {
  /**
   * OBRIGATÓRIO de propósito. Opcional aqui, a rota viraria "todas as linhas
   * deste simulado" e qualquer chamador enxergaria todos os cursinhos.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turmaId?: string;
}
```

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConsultarRelatorioDtoInput } from './dtos/consultar-relatorio.dto.input';
import { RelatorioSimuladoDtoOutput } from './dtos/relatorio-simulado.dto.output';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

@ApiTags('Relatório de Simulado')
@Controller('v1/relatorio-simulado')
export class RelatorioSimuladoEstudanteController {
  constructor(
    private readonly service: RelatorioSimuladoEstudanteService,
  ) {}

  @Get(':simuladoId')
  @ApiResponse({
    status: 200,
    description: 'linhas do simulado no recorte do cursinho (ou da turma)',
    type: RelatorioSimuladoDtoOutput,
  })
  async consultar(
    @Param('simuladoId') simuladoId: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<RelatorioSimuladoDtoOutput> {
    return this.service.consultar({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }
}
```

Em `relatorio-simulado-estudante.module.ts`, acrescente o controller e o service:

```ts
  controllers: [RelatorioSimuladoEstudanteController],
  providers: [
    RelatorioSimuladoEstudanteRepository,
    RelatorioSimuladoEstudanteService,
  ],
  exports: [RelatorioSimuladoEstudanteRepository],
```

com os imports correspondentes.

Em `src/app.module.ts`, acrescente `RelatorioSimuladoEstudanteModule` à lista de `imports` (logo
depois de `CartaoRespostaModule`) e o import do arquivo. Hoje o módulo só é alcançado por
transitividade via `CartaoRespostaModule`; quem remover aquele import faria a rota de relatório
sumir sem nenhum teste ficar vermelho.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e o build**

```bash
npm test
npm run build
```

⚠️ O build é o que pega controller ou provider mal registrado — teste de unidade constrói tudo à mão
e passa mesmo com o módulo quebrado.

Expected: suíte verde, build limpo.

- [ ] **Step 6: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.ts \
        src/modules/relatorio-simulado-estudante/dtos/consultar-relatorio.dto.input.spec.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts \
        src/app.module.ts
git commit -m "feat: rota GET /v1/relatorio-simulado/:simuladoId por recorte"
```

---

## Task 4: O teste que prova o isolamento de verdade

**Files:**
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts` (**criar**)

Os testes das tasks anteriores usam dublês: eles provam que o filtro **é montado** certo, não que o
Mongo **devolve** certo. O critério de aceite pede prova de que não vaza entre cursinhos e turmas.

Este teste roda contra um Mongo em memória.

- [ ] **Step 1: Acrescentar `mongodb-memory-server`**

Verificado: o ms-simulado **não** tem a lib, e nenhum teste dele roda contra Mongo real. O
`vcnafacul-form` já usa a mesma lib, então não é ferramenta estranha à casa. A adição foi aprovada.

```bash
npm install --save-dev mongodb-memory-server
```

⚠️ Confira que ela entrou em `devDependencies`, não em `dependencies` — ela não pode ir para o
bundle de produção. O `package-lock.json` entra no commit desta task.

- [ ] **Step 2: Write the failing test**

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`:

```ts
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  Historico,
  HistoricoSchema,
} from '../historico/historico.schema';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

const SIM_A = new Types.ObjectId();
const SIM_B = new Types.ObjectId();

describe('RelatorioSimuladoEstudante — isolamento (Mongo real em memória)', () => {
  let mongo: MongoMemoryServer;
  let repo: RelatorioSimuladoEstudanteRepository;
  let relModel: Model<RelatorioSimuladoEstudante>;
  let histModel: Model<Historico>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([
          {
            name: RelatorioSimuladoEstudante.name,
            schema: RelatorioSimuladoEstudanteSchema,
          },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [RelatorioSimuladoEstudanteRepository],
    }).compile();

    repo = mod.get(RelatorioSimuladoEstudanteRepository);
    relModel = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    histModel = mod.get(getModelToken(Historico.name));
  }, 60_000);

  afterAll(async () => {
    await mongo.stop();
  });

  const semear = async (
    simulado: Types.ObjectId,
    cursinhoId: string,
    usuario: string,
    turmaId?: string,
  ) => {
    const h = await histModel.create({
      usuario,
      simulado,
      status: 'completed',
      questoesRespondidas: 90,
      aproveitamento: { geral: 0.5, materias: [] },
    });
    await relModel.create({
      historico: h._id,
      simulado,
      usuario,
      cursinhoId,
      turmaId,
    });
  };

  beforeAll(async () => {
    await semear(SIM_A, 'cur-1', 'u-a1', 't-1');
    await semear(SIM_A, 'cur-1', 'u-a2', 't-2');
    await semear(SIM_A, 'cur-1', 'u-a3'); // sem turma
    await semear(SIM_A, 'cur-2', 'u-b1', 't-9'); // outro cursinho
    await semear(SIM_B, 'cur-1', 'u-c1', 't-1'); // outro simulado
  }, 60_000);

  it('não vaza entre cursinhos', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2', 'u-a3']);
  });

  it('não vaza entre simulados', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_B.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-c1']);
  });

  it('turmaId restringe à turma', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-a1']);
  });

  // ⚠️ ERRATA (revisão adversarial, Fix 2): este teste original só afirmava
  // `.some(...)`, que fica verde mesmo se o filtro `{turmaId: undefined}`
  // virar `{turmaId: null}` (o bug real). O spec corrigido no código-fonte
  // discrimina os dois grupos:
  it('sem turmaId, vêm TODOS: com turma e sem turma', async () => {
    // reintroduzir o bug faz esta asserção cair: o filtro {turmaId: null}
    // devolveria só 'u-a3'
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    const comTurma = r.filter((l) => l.turmaId !== undefined);
    const semTurma = r.filter((l) => l.turmaId === undefined);
    expect(comTurma.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2']);
    expect(semTurma.map((l) => l.usuario)).toEqual(['u-a3']);
  });

  it('o populate traz o histórico sem as respostas', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r[0].historico.status).toBe('completed');
    expect(r[0].historico.aproveitamento.geral).toBe(0.5);
    expect((r[0].historico as any).respostas).toBeUndefined();
  });

  it('a contagem é do cursinho, não global', async () => {
    // cur-2 também tem cartão em SIM_A; ele não pode entrar na conta
    const total = await repo.contarDoCursinho(SIM_A.toString(), 'cur-1');
    expect(total).toBe(3);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx jest src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`
Expected: PASS

⚠️ Se algum caso falhar, **não ajuste a asserção** — é este teste que justifica o card. Investigue o
repositório e relate o que encontrou.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: verde. Se a suíte ficar lenta demais por causa do Mongo em memória, relate o tempo em vez
de remover o teste.

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts \
        package.json package-lock.json
git commit -m "test: isolamento entre cursinhos, turmas e simulados contra Mongo real"
```

---

## Verificação final

- [ ] `npm test` verde · `npm run build` limpo
- [ ] `npx eslint` nos arquivos tocados, sem achados novos
- [ ] `git status` sem arquivo alheio
- [ ] Índices conferidos **no servidor** de homol, não só no schema:
      `db.relatoriosimuladoestudantes.getIndexes()` deve trazer `{simulado, cursinhoId}`,
      `{simulado, turmaId}` e o único `{simulado, cursinhoId, usuario}`

## O que vem depois

- **Card `03`** agrega por questão sobre o mesmo recorte, com `$lookup` + `$unwind` (aqui o
  `populate` basta; lá não).
- **Card `04`** consome esta rota: resolve o cursinho pelo JWT, hidrata nome e matrícula do MySQL, e
  faz o `left join` partindo dos **estudantes** para mostrar quem não enviou.
