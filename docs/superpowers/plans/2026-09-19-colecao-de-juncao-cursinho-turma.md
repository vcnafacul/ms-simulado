# A coleção de junção `RelatorioSimuladoEstudante` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar, no instante em que um cartão-resposta é enviado, a qual cursinho e turma aquela resposta pertencia — para que o relatório do cursinho seja um retrato de uma data e pare de mudar sozinho quando um aluno troca de turma.

**Architecture:** Uma coleção de junção no ms-simulado liga cada histórico **de cartão** a `cursinhoId` e `turmaId`. O `Historico` não é tocado: ele é a relação usuário ↔ simulado e vale para quem não tem cursinho nenhum. A api resolve o vínculo no upload (cursinho pelo JWT de quem envia, turma pelo `StudentCourse` do estudante) e o manda junto. As duas escritas do ms são sequenciais, com log alto quando a segunda falha.

**Tech Stack:** NestJS 10 + Mongoose (ms-simulado, Jest); NestJS 10 + TypeORM/MySQL (api-vcnafacul, Jest).

**Spec:** `ms-simulado/docs/superpowers/specs/2026-09-19-vinculo-cursinho-turma-do-historico-design.md`
**Card:** `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/08b-BACK-colecao-de-juncao-cursinho-turma.md`

**Ordem de deploy: ms-simulado → api.** Os campos novos são **opcionais** no DTO do ms exatamente para não existir janela em que o upload quebre entre os dois deploys.

⚠️ **Sujeira pré-existente nos dois repos — nunca `git add -A` nem `git commit -a`, adicione por nome:**
- ms-simulado: `src/modules/prova/factory/enem_2010_2016_factory.spec.ts` (modificado)
- client-vcnafacul: `docs/TICKET-playwright-mcp-spike.md` (não rastreado) — este repo não é tocado por este plano

---

## Estrutura de arquivos

### ms-simulado (Tasks 1-2)

| arquivo | responsabilidade | ação |
|---|---|---|
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.ts` | O documento e os três índices | **criar** |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts` | `criar()` — só o que o card 08b precisa; as consultas são do card 02 | **criar** |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts` | Registra o schema e exporta o repositório | **criar** |
| `src/modules/cartao-resposta/dtos/criar-historico-cartao.dto.input.ts` | Aceita `cursinhoId` e `turmaId` opcionais | modificar |
| `src/modules/cartao-resposta/cartao-historico.service.ts` | Cria a linha depois do histórico; loga alto se falhar | modificar |
| `src/modules/cartao-resposta/cartao-resposta.module.ts` | Importa o módulo novo | modificar |
| `src/modules/simulado/simulado.module.spec.ts` | Trava a omissão deliberada do fluxo online | **criar** |
| `src/modules/simulado/simulado.service.ts` | Comentário marcando a omissão como deliberada | modificar |

### api-vcnafacul (Tasks 3-4)

| arquivo | responsabilidade | ação |
|---|---|---|
| `src/modules/prepCourse/studentCourse/student-course.repository.ts` | `findByUserIdAndPrepCourse` — estudante escopado no cursinho, com a turma | modificar |
| `src/modules/simulado/cartao-resposta/cartao-upload.service.ts` | Resolve cursinho e turma, recusa estudante de fora, repassa | modificar |
| `src/modules/simulado/cartao-resposta/cartao-resposta-http.service.ts` | Payload ganha os dois campos | modificar |
| `src/modules/simulado/cartao-resposta/cartao-resposta.controller.ts` | Passa o `userId` de quem envia | modificar |

✅ **`simulado.module.ts` NÃO muda.** Verificado: `StudentCourseRepository` e
`CursinhoResolverService` **já são providers** desse módulo (o `CartaoRespostaResultadosService` os
usa). A injeção nova no `CartaoUploadService` funciona sem tocar no módulo.

---

## Task 1: A coleção

**Repo:** ms-simulado
**Branch:** criar `feature/08b-juncao-cursinho-turma` a partir de `develop`

**Files:**
- Create: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.ts`, `.repository.ts`, `.module.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.spec.ts`, `.repository.spec.ts`

- [ ] **Step 1: Criar a branch**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/ms-simulado
git checkout develop && git checkout -b feature/08b-juncao-cursinho-turma
```

- [ ] **Step 2: Write the failing tests**

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.spec.ts`:

```ts
import { RelatorioSimuladoEstudanteSchema } from './relatorio-simulado-estudante.schema';

describe('RelatorioSimuladoEstudante schema', () => {
  it('tem os cinco campos do contrato', () => {
    for (const path of [
      'historico',
      'simulado',
      'usuario',
      'cursinhoId',
      'turmaId',
    ]) {
      expect(RelatorioSimuladoEstudanteSchema.path(path)).toBeDefined();
    }
  });

  it('turmaId é opcional — estudante sem turma ainda gera linha', () => {
    expect(
      RelatorioSimuladoEstudanteSchema.path('turmaId').isRequired,
    ).toBeFalsy();
    expect(
      RelatorioSimuladoEstudanteSchema.path('cursinhoId').isRequired,
    ).toBe(true);
  });

  const indices = () =>
    RelatorioSimuladoEstudanteSchema.indexes().map(([campos, opts]) => ({
      campos: campos as Record<string, unknown>,
      opts: (opts ?? {}) as Record<string, unknown>,
    }));

  it('indexa os dois recortes do relatório', () => {
    const chaves = indices().map((i) => JSON.stringify(i.campos));
    expect(chaves).toContain(JSON.stringify({ simulado: 1, cursinhoId: 1 }));
    expect(chaves).toContain(JSON.stringify({ simulado: 1, turmaId: 1 }));
  });

  it('único em historico+cursinhoId — impede linha duplicada num reprocessamento', () => {
    const idx = indices().find(
      (i) => i.campos.historico === 1 && i.campos.cursinhoId === 1,
    );
    expect(idx).toBeDefined();
    expect(idx!.opts.unique).toBe(true);
  });
});
```

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.spec.ts`:

```ts
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';

describe('RelatorioSimuladoEstudanteRepository.criar', () => {
  it('grava o vínculo convertendo as refs em ObjectId', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'r1' });
    const repo = new RelatorioSimuladoEstudanteRepository({ create } as any);

    await repo.criar({
      historicoId: '665f0c1a2b3c4d5e6f00abc1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc2',
      usuario: 'u1',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    const arg = create.mock.calls[0][0];
    expect(arg.historico.toString()).toBe('665f0c1a2b3c4d5e6f00abc1');
    expect(arg.simulado.toString()).toBe('665f0c1a2b3c4d5e6f00abc2');
    expect(arg.usuario).toBe('u1');
    expect(arg.cursinhoId).toBe('cur-1');
    expect(arg.turmaId).toBe('t-1');
  });

  it('aceita estudante sem turma', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'r1' });
    const repo = new RelatorioSimuladoEstudanteRepository({ create } as any);

    await repo.criar({
      historicoId: '665f0c1a2b3c4d5e6f00abc1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc2',
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });

    expect(create.mock.calls[0][0].turmaId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: FAIL — `Cannot find module './relatorio-simulado-estudante.schema'`

- [ ] **Step 4: Write the implementation**

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.ts`:

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Historico } from '../historico/historico.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';

/**
 * A qual cursinho e turma uma resposta pertencia **no instante em que foi dada**.
 *
 * É uma junção, e não campos no `Historico`, porque o `Historico` é a relação
 * usuário ↔ simulado e vale para quem não tem cursinho nenhum. Ali, `cursinhoId: null`
 * seria ambíguo entre "esse usuário não tem cursinho" e "ainda não preenchemos".
 * Aqui, a ausência de linha tem um significado só.
 *
 * Só o fluxo de CARTÃO gera linha. Simulado resolvido digitalmente entra no
 * histórico pessoal e no relatório genérico, que esta série não toca.
 */
@Schema({ timestamps: false, versionKey: false })
export class RelatorioSimuladoEstudante extends BaseSchema {
  @Prop({ ref: Historico.name, type: Types.ObjectId, required: true })
  @ApiProperty()
  public historico: Historico;

  /** Duplicado: sem ele, filtrar por simulado exigiria um join antes do match. */
  @Prop({ ref: Simulado.name, type: Types.ObjectId, required: true })
  @ApiProperty()
  public simulado: Simulado;

  /** Duplicado: o card 04 precisa saber quem NÃO respondeu. */
  @Prop({ required: true })
  @ApiProperty()
  public usuario: string;

  @Prop({ required: true })
  @ApiProperty()
  public cursinhoId: string;

  /** Nulo para estudante sem turma — ele aparece no relatório geral e em nenhum de turma. */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public turmaId?: string;
}

export const RelatorioSimuladoEstudanteSchema = SchemaFactory.createForClass(
  RelatorioSimuladoEstudante,
);

RelatorioSimuladoEstudanteSchema.index({ simulado: 1, cursinhoId: 1 });
RelatorioSimuladoEstudanteSchema.index({ simulado: 1, turmaId: 1 });
RelatorioSimuladoEstudanteSchema.index(
  { historico: 1, cursinhoId: 1 },
  { unique: true },
);
```

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RelatorioSimuladoEstudante } from './relatorio-simulado-estudante.schema';

@Injectable()
export class RelatorioSimuladoEstudanteRepository {
  constructor(
    @InjectModel(RelatorioSimuladoEstudante.name)
    private readonly model: Model<RelatorioSimuladoEstudante>,
  ) {}

  /**
   * Só a escrita. As consultas do relatório são do card 02 — criá-las aqui
   * seria adivinhar a forma delas antes de a tela existir.
   */
  async criar(data: {
    historicoId: string;
    simuladoId: string;
    usuario: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<void> {
    await this.model.create({
      historico: new Types.ObjectId(data.historicoId),
      simulado: new Types.ObjectId(data.simuladoId),
      usuario: data.usuario,
      cursinhoId: data.cursinhoId,
      turmaId: data.turmaId,
    });
  }
}
```

Criar `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: RelatorioSimuladoEstudante.name,
        schema: RelatorioSimuladoEstudanteSchema,
      },
    ]),
  ],
  providers: [RelatorioSimuladoEstudanteRepository],
  exports: [RelatorioSimuladoEstudanteRepository],
})
export class RelatorioSimuladoEstudanteModule {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS — 6 passed

- [ ] **Step 6: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/
git commit -m "feat: coleção de junção que liga um histórico de cartão ao cursinho e à turma"
```

---

## Task 2: A linha nasce junto com o histórico

**Repo:** ms-simulado

**Files:**
- Modify: `src/modules/cartao-resposta/dtos/criar-historico-cartao.dto.input.ts`, `src/modules/cartao-resposta/cartao-historico.service.ts`, `src/modules/cartao-resposta/cartao-resposta.module.ts`
- Test: `src/modules/cartao-resposta/cartao-historico.service.spec.ts`

⚠️ **Os campos novos são OPCIONAIS no DTO, de propósito.** Se fossem obrigatórios, o ms deployado
antes da api recusaria todo upload até a api subir. Opcional + log alto quando faltar dá o mesmo
sinal sem janela de indisponibilidade — é o mesmo padrão do fallback logado do card `01`.

- [ ] **Step 1: Write the failing tests**

Em `src/modules/cartao-resposta/cartao-historico.service.spec.ts`, acrescente ao dublê do
repositório do helper de setup existente nada novo, mas **acrescente um dublê novo** para o
repositório da junção e passe-o ao construtor. Leia o arquivo antes: o construtor de
`CartaoHistoricoService` vai passar a receber **três** argumentos.

Acrescente estes testes:

```ts
  it('cria a linha de junção com o vínculo recebido', async () => {
    const historicoRepository = {
      existsCartaoAtivo: jest.fn().mockResolvedValue(false),
      createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const omrHttp = { enviarProcessamento: jest.fn().mockResolvedValue(undefined) };
    const relatorio = { criar: jest.fn().mockResolvedValue(undefined) };
    const svc = new CartaoHistoricoService(
      historicoRepository as any,
      omrHttp as any,
      relatorio as any,
    );

    await svc.criar({
      usuario: 'u1',
      imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
      cartaoCode: '7',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    expect(relatorio.criar).toHaveBeenCalledWith({
      historicoId: 'h1',
      simuladoId: '665f0c1a2b3c4d5e6f00abc1',
      usuario: 'u1',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('sem cursinhoId não cria linha, e avisa no log', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const historicoRepository = {
      existsCartaoAtivo: jest.fn().mockResolvedValue(false),
      createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const omrHttp = { enviarProcessamento: jest.fn().mockResolvedValue(undefined) };
    const relatorio = { criar: jest.fn() };
    const svc = new CartaoHistoricoService(
      historicoRepository as any,
      omrHttp as any,
      relatorio as any,
    );

    await svc.criar({
      usuario: 'u1',
      imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
      cartaoCode: '7',
    });

    expect(relatorio.criar).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('h1'));
    warn.mockRestore();
  });

  it('falha ao criar a linha NÃO derruba o upload, mas vai para o log com o historicoId', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const historicoRepository = {
      existsCartaoAtivo: jest.fn().mockResolvedValue(false),
      createAwaitingOmr: jest.fn().mockResolvedValue({ _id: 'h1' }),
      marcarFalha: jest.fn().mockResolvedValue(undefined),
    };
    const omrHttp = { enviarProcessamento: jest.fn().mockResolvedValue(undefined) };
    const relatorio = {
      criar: jest.fn().mockRejectedValue(new Error('mongo caiu')),
    };
    const svc = new CartaoHistoricoService(
      historicoRepository as any,
      omrHttp as any,
      relatorio as any,
    );

    // o cartão é lido normalmente; só fica fora do relatório até alguém reconciliar
    const r = await svc.criar({
      usuario: 'u1',
      imageKey: 'cartoes/665f0c1a2b3c4d5e6f00abc1/i.jpg',
      cartaoCode: '7',
      cursinhoId: 'cur-1',
    });

    expect(r).toEqual({ historicoId: 'h1' });
    expect(omrHttp.enviarProcessamento).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('h1'));
    error.mockRestore();
  });
```

Acrescente `import { Logger } from '@nestjs/common';` no topo do arquivo de teste, e ajuste os
testes que já existem para passar um terceiro argumento ao construtor —
`{ criar: jest.fn() } as any` basta neles.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/cartao-resposta/cartao-historico.service.spec.ts`
Expected: FAIL — o construtor aceita dois argumentos e `relatorio.criar` nunca é chamado

- [ ] **Step 3: Write the implementation**

Em `src/modules/cartao-resposta/dtos/criar-historico-cartao.dto.input.ts`, substitua o arquivo por:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CriarHistoricoCartaoDtoInput {
  @ApiProperty() @IsString() @IsNotEmpty() usuario: string;
  @ApiProperty() @IsString() @IsNotEmpty() imageKey: string;
  @ApiProperty() @IsString() @IsNotEmpty() cartaoCode: string;

  /**
   * Opcional de propósito: obrigatório faria o ms recusar todo upload entre o
   * seu deploy e o da api. A ausência vira log alto, não 400.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cursinhoId?: string;

  /** Ausente quando o estudante não tem turma — a linha é criada mesmo assim. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turmaId?: string;
}
```

Em `src/modules/cartao-resposta/cartao-historico.service.ts`, substitua o arquivo por:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { parseSimuladoId } from './imagekey.util';
import { OmrHttpService } from './omr-http.service';

@Injectable()
export class CartaoHistoricoService {
  private readonly logger = new Logger(CartaoHistoricoService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly omrHttp: OmrHttpService,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
  ) {}

  async criar(dto: {
    usuario: string;
    imageKey: string;
    cartaoCode: string;
    cursinhoId?: string;
    turmaId?: string;
  }): Promise<{ historicoId: string }> {
    const simuladoId = parseSimuladoId(dto.imageKey);

    if (
      await this.historicoRepository.existsCartaoAtivo(
        dto.usuario,
        simuladoId,
        dto.cartaoCode,
      )
    ) {
      throw new ConflictException('cartão já enviado para este usuário');
    }

    const historico = await this.historicoRepository.createAwaitingOmr({
      usuario: dto.usuario,
      simuladoId,
      imageKey: dto.imageKey,
      cartaoCode: dto.cartaoCode,
    });
    const historicoId = (
      historico as unknown as { _id: { toString(): string } }
    )._id.toString();

    await this.vincularAoCursinho(historicoId, simuladoId, dto);

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

    return { historicoId };
  }

  /**
   * Escrita sequencial, não transacional: o compose de dev sobe um Mongo standalone,
   * e uma transação aqui quebraria o ambiente local de quem não soubesse.
   *
   * O preço é uma linha órfã possível. Ela é RECUPERÁVEL — o vínculo continua no
   * MySQL — mas só se deixar rastro: um cartão fora do relatório sem nada no log é
   * o chamado que ninguém reproduz.
   */
  private async vincularAoCursinho(
    historicoId: string,
    simuladoId: string,
    dto: { usuario: string; cursinhoId?: string; turmaId?: string },
  ): Promise<void> {
    if (!dto.cursinhoId) {
      this.logger.warn(
        `histórico ${historicoId} criado SEM cursinhoId — ficará fora de todo relatório de cursinho`,
      );
      return;
    }
    try {
      await this.relatorioRepository.criar({
        historicoId,
        simuladoId,
        usuario: dto.usuario,
        cursinhoId: dto.cursinhoId,
        turmaId: dto.turmaId,
      });
    } catch (err) {
      this.logger.error(
        `histórico ${historicoId} criado mas NÃO vinculado ao cursinho ${dto.cursinhoId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
```

Em `src/modules/cartao-resposta/cartao-resposta.module.ts`, acrescente o import do módulo novo e
inclua-o na lista de `imports`:

```ts
import { RelatorioSimuladoEstudanteModule } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.module';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/cartao-resposta/`
Expected: PASS — pasta inteira verde

- [ ] **Step 5: Travar a omissão deliberada do fluxo online**

O card exige um teste provando que o simulado resolvido digitalmente **não** gera linha. Um teste que
simplesmente não chama nada seria vazio — o que discrimina é a **fiação dos módulos**: se alguém
"consertar" a omissão importando o módulo da junção no `SimuladoModule`, este teste fica vermelho.

Criar `src/modules/simulado/simulado.module.spec.ts`:

```ts
import { RelatorioSimuladoEstudanteModule } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.module';
import { SimuladoModule } from './simulado.module';

describe('SimuladoModule — o fluxo online não gera linha de relatório', () => {
  it('não conhece a coleção de junção', () => {
    // Omissão DELIBERADA (card 08): simulado resolvido digitalmente entra no
    // histórico pessoal e no relatório genérico, que esta série não toca.
    // Só o fluxo de cartão vincula a cursinho/turma.
    const imports = (Reflect.getMetadata('imports', SimuladoModule) ??
      []) as unknown[];
    expect(imports).not.toContain(RelatorioSimuladoEstudanteModule);
  });
});
```

E acrescente o comentário em `src/modules/simulado/simulado.service.ts`, imediatamente acima da
chamada a `this.historicoRepository.createPending(` (por volta da linha 168):

```ts
    // Não gera linha em RelatorioSimuladoEstudante: por decisão do card 08, só o
    // fluxo de cartão vincula a resposta a cursinho/turma. O online já aparece no
    // relatório genérico. A omissão é deliberada — ver simulado.module.spec.ts.
```

Run: `npx jest src/modules/simulado/simulado.module.spec.ts`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira e o build**

```bash
npm test
npm run build
```

⚠️ O build importa: um módulo mal registrado só aparece aí ou em runtime, não nos testes de unidade.

Expected: suíte verde, build sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/modules/cartao-resposta/dtos/criar-historico-cartao.dto.input.ts \
        src/modules/cartao-resposta/cartao-historico.service.ts \
        src/modules/cartao-resposta/cartao-resposta.module.ts \
        src/modules/cartao-resposta/cartao-historico.service.spec.ts \
        src/modules/simulado/simulado.service.ts \
        src/modules/simulado/simulado.module.spec.ts
git commit -m "feat: o upload do cartão grava o vínculo com cursinho e turma"
```

---

## Task 3: Buscar o estudante escopado no cursinho, com a turma

**Repo:** api-vcnafacul
**Branch:** criar `feature/08b-vinculo-no-upload-do-cartao` a partir de `develop`

**Files:**
- Modify: `src/modules/prepCourse/studentCourse/student-course.repository.ts`
- Test: `src/modules/prepCourse/studentCourse/student-course.repository.spec.ts` (crie o arquivo se não existir)

- [ ] **Step 1: Criar a branch**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-3/api-vcnafacul
git checkout develop && git checkout -b feature/08b-vinculo-no-upload-do-cartao
```

- [ ] **Step 2: Write the failing test**

Acrescente (ou crie o arquivo com) este teste em
`src/modules/prepCourse/studentCourse/student-course.repository.spec.ts`:

```ts
import { StudentCourseRepository } from './student-course.repository';

describe('StudentCourseRepository.findByUserIdAndPrepCourse', () => {
  const montar = () => {
    const qb: any = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.leftJoinAndSelect = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn().mockResolvedValue({ id: 's1', class: { id: 't-1' } });
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    // ⚠️ O construtor recebe um EntityManager e chama `getRepository(StudentCourse)`
    // no super — não o repositório direto.
    const entityManager = { getRepository: jest.fn().mockReturnValue(repository) };
    const repo = new StudentCourseRepository(entityManager as any);
    return { repo, qb };
  };

  it('filtra por usuário E cursinho, e traz a turma junto', async () => {
    const { repo, qb } = montar();

    const r = await repo.findByUserIdAndPrepCourse('u1', 'cur-1');

    expect(r?.class?.id).toBe('t-1');
    // o escopo por cursinho é o que impede enviar cartão de aluno de outro cursinho
    const clausulas = [...qb.where.mock.calls, ...qb.andWhere.mock.calls]
      .map((c) => JSON.stringify(c))
      .join(' ');
    expect(clausulas).toContain('u1');
    expect(clausulas).toContain('cur-1');
    // sem a turma carregada, o vínculo iria para o ms sem turmaId
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'entity.class',
      expect.any(String),
    );
  });
});
```

⚠️ **Não mude o construtor** para acomodar o teste — o dublê acima já reflete o real
(`student-course.repository.ts:66`: `@InjectEntityManager()` + `super(_entityManager.getRepository(StudentCourse))`).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/modules/prepCourse/studentCourse/student-course.repository.spec.ts`
Expected: FAIL — `repo.findByUserIdAndPrepCourse is not a function`

- [ ] **Step 4: Write the implementation**

Em `src/modules/prepCourse/studentCourse/student-course.repository.ts`, acrescente logo depois de
`findByEnrollmentCodeAndPrepCourse`:

```ts
  /**
   * Estudante de um cursinho específico, com a turma carregada.
   *
   * O escopo por cursinho não é conveniência: é o que impede um colaborador de
   * enviar cartão para um estudante de outro cursinho.
   */
  async findByUserIdAndPrepCourse(
    userId: string,
    prepCourseId: string,
  ): Promise<StudentCourse | null> {
    return await this.repository
      .createQueryBuilder('entity')
      .innerJoin('entity.user', 'user')
      .where('user.id = :userId', { userId })
      .innerJoin('entity.partnerPrepCourse', 'partnerPrepCourse')
      .andWhere('partnerPrepCourse.id = :prepCourseId', { prepCourseId })
      .leftJoinAndSelect('entity.class', 'class')
      .getOne();
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/modules/prepCourse/studentCourse/student-course.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/prepCourse/studentCourse/student-course.repository.ts \
        src/modules/prepCourse/studentCourse/student-course.repository.spec.ts
git commit -m "feat: busca de estudante escopada no cursinho, com a turma"
```

---

## Task 4: A api resolve o vínculo e o repassa

**Repo:** api-vcnafacul

**Files:**
- Modify: `src/modules/simulado/cartao-resposta/cartao-upload.service.ts`, `.../cartao-resposta-http.service.ts`, `.../cartao-resposta.controller.ts`
- Test: `src/modules/simulado/cartao-resposta/cartao-upload.service.spec.ts`, `.../cartao-resposta.controller.spec.ts`

⚠️ **Esta task muda o comportamento do endpoint de upload.** Hoje ele aceita
`@Body('usuario')` sem olhar quem está enviando — um colaborador do cursinho A consegue enviar
cartão para um estudante do cursinho B. Para descobrir a turma é preciso buscar o `StudentCourse`
escopado no cursinho de quem envia, e isso **fecha essa falha de isolamento**.

⚠️ **Consequência a registrar no PR:** quem não for colaborador de nenhum cursinho passa a receber
403 no upload (`CursinhoResolverService` já lança `ForbiddenException` nesse caso). O card `08`
menciona *"um admin da plataforma envia cartão de alguém"* como cenário — com esta mudança, ele
precisa ser colaborador de um cursinho. **Confirme isso na revisão antes do merge.**

- [ ] **Step 1: Write the failing tests**

Em `src/modules/simulado/cartao-resposta/cartao-upload.service.spec.ts`, substitua o `setup()`
existente por este e acrescente os testes abaixo (mantenha os testes que já existem, ajustando as
chamadas de `processar` para a assinatura nova):

```ts
function setup(over: any = {}) {
  const blob = { putObjectAtKey: jest.fn().mockResolvedValue(undefined) };
  const omrCache = { primeImagem: jest.fn().mockResolvedValue(undefined) };
  const cartaoHttp = {
    criarHistorico: jest.fn().mockResolvedValue({ historicoId: 'h1' }),
  };
  const env = { get: jest.fn().mockReturnValue('vcnafacul-cartoes') };
  const cursinhoResolver = {
    resolveCursinhoIdByUserId: jest.fn().mockResolvedValue('cur-1'),
    ...over.cursinhoResolver,
  };
  const studentCourseRepository = {
    findByUserIdAndPrepCourse: jest
      .fn()
      .mockResolvedValue({ id: 's1', class: { id: 't-1' } }),
    ...over.studentCourseRepository,
  };
  return {
    svc: new CartaoUploadService(
      blob as any,
      omrCache as any,
      cartaoHttp as any,
      env as any,
      cursinhoResolver as any,
      studentCourseRepository as any,
    ),
    blob,
    omrCache,
    cartaoHttp,
    cursinhoResolver,
    studentCourseRepository,
  };
}
```

```ts
it('repassa cursinho e turma do instante do envio', async () => {
  (decodeCartaoQr as jest.Mock).mockResolvedValue({
    simuladoId: '665',
    cartaoCode: '7',
  });
  const { svc, cartaoHttp } = setup();
  const file: any = { buffer: Buffer.from('IMG'), mimetype: 'image/jpeg' };

  await svc.processar('u-colab', 'u-aluno', file);

  expect(cartaoHttp.criarHistorico).toHaveBeenCalledWith(
    expect.objectContaining({
      usuario: 'u-aluno',
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    }),
  );
});

it('estudante sem turma vai sem turmaId, e o upload segue', async () => {
  (decodeCartaoQr as jest.Mock).mockResolvedValue({
    simuladoId: '665',
    cartaoCode: '7',
  });
  const { svc, cartaoHttp } = setup({
    studentCourseRepository: {
      findByUserIdAndPrepCourse: jest.fn().mockResolvedValue({ id: 's1' }),
    },
  });
  const file: any = { buffer: Buffer.from('IMG'), mimetype: 'image/jpeg' };

  await svc.processar('u-colab', 'u-aluno', file);

  expect(cartaoHttp.criarHistorico).toHaveBeenCalledWith(
    expect.objectContaining({ cursinhoId: 'cur-1', turmaId: undefined }),
  );
});

it('recusa cartão de estudante que não é do cursinho de quem envia', async () => {
  (decodeCartaoQr as jest.Mock).mockResolvedValue({
    simuladoId: '665',
    cartaoCode: '7',
  });
  const { svc, cartaoHttp, blob } = setup({
    studentCourseRepository: {
      findByUserIdAndPrepCourse: jest.fn().mockResolvedValue(null),
    },
  });
  const file: any = { buffer: Buffer.from('IMG'), mimetype: 'image/jpeg' };

  await expect(
    svc.processar('u-colab', 'u-de-outro-cursinho', file),
  ).rejects.toThrow(ForbiddenException);

  // recusa ANTES de subir o arquivo: nada de lixo no bucket
  expect(blob.putObjectAtKey).not.toHaveBeenCalled();
  expect(cartaoHttp.criarHistorico).not.toHaveBeenCalled();
});
```

Acrescente `ForbiddenException` ao import de `@nestjs/common` no topo do arquivo de teste.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/simulado/cartao-resposta/cartao-upload.service.spec.ts`
Expected: FAIL — o construtor aceita quatro argumentos e `processar` aceita dois

- [ ] **Step 3: Write the implementation**

Substitua `src/modules/simulado/cartao-resposta/cartao-upload.service.ts` por:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { StudentCourseRepository } from 'src/modules/prepCourse/studentCourse/student-course.repository';
import { EnvService } from 'src/shared/modules/env/env.service';
import { BlobService } from 'src/shared/services/blob/blob-service';
import { CursinhoResolverService } from '../prova/cursinho/cursinho-resolver.service';
import { CartaoRespostaHttpService } from './cartao-resposta-http.service';
import { OmrCacheService } from './omr-cache.service';
import { decodeCartaoQr } from './qr-decoder';

@Injectable()
export class CartaoUploadService {
  constructor(
    @Inject('BlobService')
    private readonly blobService: BlobService,
    private readonly omrCache: OmrCacheService,
    private readonly cartaoHttp: CartaoRespostaHttpService,
    private readonly env: EnvService,
    private readonly cursinhoResolver: CursinhoResolverService,
    private readonly studentCourseRepository: StudentCourseRepository,
  ) {}

  async processar(
    colaboradorUserId: string,
    usuario: string,
    file: Express.Multer.File,
  ): Promise<{ historicoId: string }> {
    if (!file?.buffer) {
      throw new BadRequestException('arquivo do cartão é obrigatório');
    }

    // Resolvido ANTES de tocar no bucket: recusar depois deixaria a imagem órfã lá.
    const { cursinhoId, turmaId } = await this.resolverVinculo(
      colaboradorUserId,
      usuario,
    );

    const { simuladoId, cartaoCode } = await decodeCartaoQr(file.buffer);
    const imageKey = `cartoes/${simuladoId}/${uuidv4()}.jpg`;

    await this.blobService.putObjectAtKey(
      file.buffer,
      this.env.get('BUCKET_CARTAO'),
      imageKey,
      file.mimetype ?? 'image/jpeg',
    );
    await this.omrCache.primeImagem(imageKey, file.buffer);

    return this.cartaoHttp.criarHistorico({
      usuario,
      imageKey,
      cartaoCode,
      cursinhoId,
      turmaId,
    });
  }

  /**
   * O cursinho vem de QUEM ENVIA, pelo JWT — nunca do corpo da requisição. A turma
   * vem do estudante naquele instante, e é o que congela o relatório numa data.
   *
   * Buscar o estudante escopado no cursinho também fecha uma falha antiga: antes
   * disto, o `usuario` do corpo era aceito sem conferir a que cursinho ele pertencia.
   */
  private async resolverVinculo(
    colaboradorUserId: string,
    usuario: string,
  ): Promise<{ cursinhoId: string; turmaId?: string }> {
    const cursinhoId =
      await this.cursinhoResolver.resolveCursinhoIdByUserId(colaboradorUserId);
    const student =
      await this.studentCourseRepository.findByUserIdAndPrepCourse(
        usuario,
        cursinhoId,
      );
    if (!student) {
      throw new ForbiddenException('estudante não pertence ao seu cursinho');
    }
    return { cursinhoId, turmaId: student.class?.id };
  }
}
```

Em `src/modules/simulado/cartao-resposta/cartao-resposta-http.service.ts`, acrescente os dois campos
opcionais à assinatura do `criarHistorico` (o corpo, que faz `axios.post`, não muda):

```ts
  async criarHistorico(payload: {
    usuario: string;
    imageKey: string;
    cartaoCode: string;
    cursinhoId?: string;
    turmaId?: string;
  }) {
```

Em `src/modules/simulado/cartao-resposta/cartao-resposta.controller.ts`, o método `upload` passa a
receber a requisição e repassar quem envia:

```ts
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('usuario') usuario: string,
    @Req() req: Request,
  ) {
    return this.uploadService.processar(
      (req.user as User).id,
      usuario,
      file,
    );
  }
```

(`Req`, `Request` e `User` já estão importados no arquivo — confira.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/simulado/cartao-resposta/`
Expected: PASS — pasta inteira verde

- [ ] **Step 5: Build e suíte de unidade**

```bash
npm run build
npx jest src/modules/simulado src/modules/prepCourse/studentCourse
```

⚠️ O build é o que pega dependência não registrada no módulo. Um teste de unidade constrói o
serviço à mão e passa mesmo com o módulo quebrado.

Expected: build sem erro, testes verdes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/simulado/cartao-resposta/cartao-upload.service.ts \
        src/modules/simulado/cartao-resposta/cartao-resposta-http.service.ts \
        src/modules/simulado/cartao-resposta/cartao-resposta.controller.ts \
        src/modules/simulado/cartao-resposta/cartao-upload.service.spec.ts \
        src/modules/simulado/cartao-resposta/cartao-resposta.controller.spec.ts
git commit -m "feat: o upload resolve cursinho e turma, e recusa aluno de outro cursinho"
```

---

## Verificação final

- [ ] ms-simulado: `npm test` verde, `npm run build` sem erro, `npx eslint "src/**/*.ts"` sem achados novos
- [ ] api: `npm run build` sem erro, `npx jest src/modules/simulado src/modules/prepCourse/studentCourse` verde
- [ ] `git status` nos dois repos sem arquivo alheio no stage; o `enem_2010_2016_factory.spec.ts` continua **não commitado**
- [ ] Manual em homol, na ordem **ms → api**: enviar um cartão e conferir no Mongo que nasceu
      **uma** linha em `relatoriosimuladoestudantes` com `cursinhoId` e `turmaId` corretos
- [ ] Manual: enviar cartão de um estudante de outro cursinho e confirmar **403**
- [ ] Manual: resolver um simulado digitalmente e confirmar que **nenhuma** linha nasceu

## Deploy

**ms-simulado → api.** Os campos são opcionais no DTO do ms, então não há janela em que o upload
quebre: com o ms novo e a api velha, o cartão é criado e o log avisa que ficou sem vínculo.

Sem migração. A coleção nasce vazia e **sem backfill** — o cartão-resposta ainda não está em
produção, então não há nada de fora.

## O que vem depois

- **Card `02`** consome esta coleção: `find({ simulado, cursinhoId })` e `find({ simulado, turmaId })`.
  ⚠️ E precisa chamar `descreverFalha` em cada linha — nada no código força.
- **Card `09`** depende do único em `{ historico, cursinhoId }` para o reprocessamento não duplicar.
