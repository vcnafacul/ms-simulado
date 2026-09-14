# Categoria por cursinho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada cursinho suas próprias categorias de simulado — nome único por dono, invisíveis para os outros, e sempre gerando 1 simulado por prova.

**Architecture:** `Categoria` ganha `dono` (`'system'` ou o `cursinhoId`). O índice único global de `nome` vira composto `{dono, nome}`. A api ganha um controller de cursinho que injeta o `dono` a partir do JWT — nunca do corpo — no mesmo molde do `cursinho-prova.controller` já existente. O client passa a consumir a rota escopada.

**Tech Stack:** NestJS 10 + Mongoose (ms-simulado) · NestJS 10 + TypeORM/MySQL (api-vcnafacul) · React 19 + Vite (client-vcnafacul) · `mongosh` para a migração

**Spec:** `ms-simulado/docs/superpowers/specs/2026-09-13-categoria-por-cursinho-design.md`

---

## Três achados que a spec não previu

Os três entraram como tarefa porque **bloqueiam a feature**, não são melhorias.

### A. O exame não é alcançável pelo client — e sem exame não se cria categoria

`ManageCategorias` monta o dropdown de exame **derivando da lista de categorias** (`index.tsx:41-49`).
Hoje funciona porque a lista é global e sempre tem itens.

Com o recorte por dono, **um cursinho novo tem zero categorias → zero exames no dropdown → não
consegue criar a primeira**. Chicken-and-egg que trava a feature inteira.

⚠️ O ms **tem** `GET /v1/exame`, mas a **api não faz proxy dele** e o client não tem serviço. É a
Task 8.

### B. Soft delete + índice único = nome queimado para sempre

`BaseRepository.delete` é **soft** (`deleted: true`), e `getByFilter` **não filtra por `deleted`**.
Então: o cursinho cria "Enem Dia 1", exclui, tenta criar de novo → **409**, com o nome preso a um
documento que ele não vê mais.

O defeito já existe hoje no escopo global, mas é raro (só admin cria categoria). Com cursinhos
nomeando à vontade, vira rotina. Como esta é a tarefa que **reescreve o índice único**, acertar isso
agora é parte do trabalho, não um extra. Resolvido nas Tasks 1 e 2.

### C. O formulário não tem campo de nome — ele monta o nome pelo pattern

`createForm.tsx` coleta **`prefixo`**, não nome, e mostra um preview gerado por `gerarNomePreview`
(`<Prefixo> <Nq>|livre <Dmin>`). O `createCategoria` nem envia `nome` — há um comentário explícito:
*"nome não é enviado — o backend gera o nome da categoria"*.

O cursinho precisa digitar **"Enem Dia 1"** literalmente. Sem um modo de nome livre no formulário, a
Task 2 (que dispensa o pattern para cursinho) não tem como ser exercida pela interface. É a Task 14.

---

## File Structure

### ms-simulado — branch `feature/categoria-dono-cursinho` (já criada, spec commitada)

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/categoria/schemas/categoria.schema.ts` | campo `dono`, constante `DONO_SYSTEM`, índice composto parcial |
| `src/modules/categoria/categoria.service.ts` | `dono` como parâmetro, colisão escopada, pattern condicional, delete com dono |
| `src/modules/categoria/categoria.repository.ts` | filtro `dono` no `getAll`, `getAtivaByNomeEDono` |
| `src/modules/categoria/categoria.controller.ts` | query `dono`, header `x-dono` no POST/DELETE |
| `src/modules/prova/factory/prova_factory.ts` | roteamento explícito por dono |
| `scripts/migrations/0003-categoria-dono/` | backfill + troca de índice |

### api-vcnafacul — branch `feature/categoria-dono-cursinho`

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/role/permissions/permissions.ts` | `gerenciarCategoriasCursinho` |
| `src/modules/role/role.entity.ts` | coluna booleana |
| `src/db/migrations/<ts>-add_permissao_categorias_cursinho.ts` | ALTER TABLE |
| `src/modules/simulado/exame/exame.controller.ts` + `exame.service.ts` | proxy de `v1/exame` |
| `src/modules/simulado/categoria/cursinho/cursinho-categoria.controller.ts` | CRUD escopado, `dono` do JWT |
| `src/modules/simulado/categoria/categoria.service.ts` | `dono` nos métodos do proxy |
| `src/modules/simulado/categoria/categoria.controller.ts` | admin injeta `'system'` |
| `src/modules/simulado/simulado.module.ts` | registra os controllers novos |

### client-vcnafacul — branch `feature/categoria-dono-cursinho`

| Arquivo | Responsabilidade |
|---|---|
| `src/enums/roles/roles.ts` | `gerenciarCategoriasCursinho` |
| `src/services/urls.ts` | `cursinhoCategoria`, `exame` |
| `src/services/categoria/getCategoriasCursinho.ts` · `createCategoriaCursinho.ts` · `deleteCategoriaCursinho.ts` | rotas escopadas |
| `src/services/exame/getExames.ts` | resolve o achado A |
| `src/pages/dashProvas/modals/manageCategorias/index.tsx` | serviços por prop; exames do endpoint |
| `src/pages/dashProvas/modals/manageCategorias/createForm.tsx` | modo de nome livre para cursinho |
| `src/pages/partnerPrepProvas/index.tsx` | usa os serviços do cursinho, habilita a ação |

---

# PARTE 1 — ms-simulado

Branch `feature/categoria-dono-cursinho` já existe e já tem a spec commitada. Confirme antes de começar:

```bash
cd ms-simulado && git branch --show-current   # feature/categoria-dono-cursinho
```

⚠️ **Nunca rode `yarn lint` neste repo** — ele reformata o repositório inteiro. Use
`npx eslint <caminhos explícitos>`.

---

### Task 1: `dono` no schema e o índice composto parcial

**Files:**
- Modify: `src/modules/categoria/schemas/categoria.schema.ts`
- Test: `src/modules/categoria/schemas/categoria.schema.spec.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/modules/categoria/schemas/categoria.schema.spec.ts`:

```ts
import { model } from 'mongoose';
import {
  Categoria,
  CategoriaSchema,
  DONO_SYSTEM,
} from './categoria.schema';

/**
 * ⚠️ `model(...).hydrate(...)` casta OFFLINE — sem banco. É o que permite
 * testar default e índice no CI, que não sobe Mongo.
 */
const CategoriaModel = model<Categoria>('CategoriaSchemaSpec', CategoriaSchema);

describe('CategoriaSchema — dono', () => {
  it('o default do dono é a sentinela do sistema', () => {
    const doc = new CategoriaModel({ nome: 'X 10q 30min', duracao: 30 });
    expect(doc.dono).toBe(DONO_SYSTEM);
    expect(DONO_SYSTEM).toBe('system');
  });

  it('aceita um cursinhoId como dono', () => {
    const doc = new CategoriaModel({ nome: 'Enem Dia 1', dono: 'cur-1' });
    expect(doc.dono).toBe('cur-1');
  });

  it('o unique global de nome NÃO existe mais', () => {
    /**
     * ⚠️ É o coração da feature. Com `nome` unique global, o cursinho A não
     * consegue criar "Enem Dia 1" — e o código novo estaria todo certo, com
     * o servidor barrando por um índice que ninguém está mais olhando.
     */
    const nomeSozinho = CategoriaSchema.indexes().find(
      ([chaves]) =>
        Object.keys(chaves).length === 1 && chaves.nome === 1,
    );
    expect(nomeSozinho).toBeUndefined();
    expect(CategoriaSchema.path('nome').options.unique).toBeFalsy();
  });

  it('o índice único é composto por dono+nome, e ignora os excluídos', () => {
    const [chaves, opcoes] = CategoriaSchema.indexes().find(
      ([, o]) => o?.name === 'dono_nome_unico',
    )!;

    expect(chaves).toEqual({ dono: 1, nome: 1 });
    expect(opcoes.unique).toBe(true);
    /**
     * ⚠️ Sem o parcial, o soft delete queima o nome PARA SEMPRE: o documento
     * excluído continua ocupando a chave única e o cursinho não recria uma
     * categoria que ele mesmo apagou.
     *
     * ⚠️ `{ deleted: false }` e não `{ deleted: { $ne: true } }` — o Mongo NÃO
     * aceita `$ne` em partialFilterExpression. Funciona porque `deleted` tem
     * `default: false` no BaseSchema; a migração faz o backfill dos antigos.
     */
    expect(opcoes.partialFilterExpression).toEqual({ deleted: false });
  });

  it('o índice tem nome explícito', () => {
    // ⚠️ Dois index() sobre chaves parecidas pedem nomes derivados iguais e o
    // servidor recusa o segundo com IndexKeySpecsConflict — com autoIndex, a
    // aplicação sobe em silêncio SEM o índice. Já aconteceu neste repo.
    const semNome = CategoriaSchema.indexes().filter(([, o]) => !o?.name);
    expect(semNome).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/categoria/schemas/categoria.schema.spec.ts
```

Esperado: FAIL — `DONO_SYSTEM` não é exportado (`Cannot find name 'DONO_SYSTEM'`).

- [ ] **Step 3: Implementar**

Em `src/modules/categoria/schemas/categoria.schema.ts`, adicione a constante antes da classe:

```ts
/**
 * Dono das categorias da plataforma.
 *
 * ⚠️ Sentinela, e NUNCA nulo. Num índice composto único, documento com o campo
 * ausente e documento com o campo nulo não são a mesma coisa em toda versão do
 * Mongo — e a diferença só aparece quando a segunda categoria de mesmo nome é
 * criada, em produção.
 */
export const DONO_SYSTEM = 'system';
```

Troque a linha do `nome` (hoje `@Prop({ unique: true })`) por:

```ts
  // ⚠️ O `unique` saiu daqui: a unicidade agora é composta com `dono`, no
  // índice declarado no fim do arquivo.
  @Prop()
  @ApiProperty()
  public nome: string;
```

Adicione o campo, depois de `selecionavel`:

```ts
  @Prop({ required: true, default: DONO_SYSTEM })
  @ApiProperty({ default: DONO_SYSTEM })
  public dono: string;
```

E depois do `export const CategoriaSchema = ...`:

```ts
/**
 * ⚠️ **Parcial de propósito.** `BaseRepository.delete` é SOFT delete
 * (`deleted: true`). Sem `partialFilterExpression`, o documento excluído
 * continua ocupando a chave única e o cursinho não consegue recriar uma
 * categoria que ele mesmo apagou — recebendo 409 por um registro invisível.
 *
 * ⚠️ `{ deleted: false }`, não `{ deleted: { $ne: true } }`: o Mongo não aceita
 * `$ne` em partialFilterExpression. `deleted` tem `default: false` no
 * `BaseSchema`, e a migração 0003 faz o backfill dos documentos antigos.
 *
 * ⚠️ `name` explícito. Sem ele o Mongo deriva do padrão de chaves e um segundo
 * índice parecido colide com `IndexKeySpecsConflict` — que, com `autoIndex`,
 * deixa a aplicação subir sem o índice, em silêncio.
 */
CategoriaSchema.index(
  { dono: 1, nome: 1 },
  {
    unique: true,
    partialFilterExpression: { deleted: false },
    name: 'dono_nome_unico',
  },
);
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx jest src/modules/categoria/schemas/categoria.schema.spec.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Provar os testes por mutação**

Rode cada mutação, confirme VERMELHO, e desfaça:

1. Trocar `default: DONO_SYSTEM` por `default: null` → falha "o default do dono".
2. Devolver `unique: true` ao `@Prop()` do `nome` → falha "o unique global".
3. Remover `partialFilterExpression` → falha "ignora os excluídos".
4. Remover `name: 'dono_nome_unico'` → falha "nome explícito" **e** "composto por dono+nome".

⚠️ **Confira o arquivo depois de cada `sed`/`perl`.** O prettier reformata objetos em várias linhas e
um padrão de uma linha só deixa de casar — a mutação "sobrevive" sem nunca ter sido aplicada. Isso já
aconteceu neste projeto.

- [ ] **Step 6: Commit**

```bash
git add src/modules/categoria/schemas/categoria.schema.ts src/modules/categoria/schemas/categoria.schema.spec.ts
git commit -m "feat(categoria): campo dono e indice unico composto dono+nome

O unique global de \`nome\` sai do @Prop e vira \`{dono, nome}\` parcial.
Parcial porque o delete e SOFT: sem isso o nome fica queimado para sempre
e o cursinho recebe 409 de um registro que nao ve mais."
```

---

### Task 2: colisão escopada, pattern condicional e o `dono` como parâmetro

**Files:**
- Modify: `src/modules/categoria/categoria.repository.ts`
- Modify: `src/modules/categoria/categoria.service.ts:28-66`
- Test: `src/modules/categoria/categoria.service.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `src/modules/categoria/categoria.service.spec.ts`:

```ts
describe('CategoriaService — dono', () => {
  let service: CategoriaService;
  let repository: {
    getAtivaByNomeEDono: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
    delete: jest.Mock;
    getAll: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      getAtivaByNomeEDono: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (c) => c),
      getById: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn(),
    };
    service = new CategoriaService(
      repository as never,
      { countByCategoria: jest.fn().mockResolvedValue(0) } as never,
      { countByCategoria: jest.fn().mockResolvedValue(0) } as never,
    );
  });

  const dto = { duracao: 60, quantidadeTotalQuestao: 30, exame: 'e1' } as never;

  it('grava o dono recebido, e não o que veio no corpo', async () => {
    /**
     * ⚠️ A garantia de isolamento. Se o `dono` puder vir do DTO, o cursinho A
     * cria categoria em nome do B mandando um campo a mais no JSON.
     */
    const criada = await service.add(
      { ...(dto as object), dono: 'HACK' } as never,
      'cur-1',
    );
    expect(criada.dono).toBe('cur-1');
  });

  it('sem dono informado, é do sistema', async () => {
    const criada = await service.add({ ...(dto as object), nome: 'X 30q 60min' } as never);
    expect(criada.dono).toBe(DONO_SYSTEM);
  });

  it('a colisão é por dono+nome, não só por nome', async () => {
    await service.add({ ...(dto as object), nome: 'Enem Dia 1' } as never, 'cur-1');
    expect(repository.getAtivaByNomeEDono).toHaveBeenCalledWith(
      'Enem Dia 1',
      'cur-1',
    );
  });

  it('mesmo nome e mesmo dono dá 409', async () => {
    repository.getAtivaByNomeEDono.mockResolvedValue({ _id: 'ja-existe' });
    await expect(
      service.add({ ...(dto as object), nome: 'Enem Dia 1' } as never, 'cur-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('o pattern do nome vale para o sistema', async () => {
    await expect(
      service.add({ ...(dto as object), nome: 'Enem Dia 1' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('o pattern NÃO vale para categoria de cursinho', async () => {
    // ⚠️ É o que torna possível o exemplo do ticket: o cursinho A criando a
    // própria "Enem Dia 1", que bate 400 no pattern do admin.
    const criada = await service.add(
      { ...(dto as object), nome: 'Enem Dia 1' } as never,
      'cur-1',
    );
    expect(criada.nome).toBe('Enem Dia 1');
  });

  it('categoria de cursinho continua custom — é o que garante 1 simulado', async () => {
    const criada = await service.add(
      { ...(dto as object), nome: 'Enem Dia 1' } as never,
      'cur-1',
    );
    expect(criada.custom).toBe(true);
  });
});
```

Adicione ao topo do arquivo, se ainda não houver:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DONO_SYSTEM } from './schemas/categoria.schema';
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/categoria/categoria.service.spec.ts
```

Esperado: FAIL — `repository.getAtivaByNomeEDono is not a function` e `add` aceita 1 argumento.

- [ ] **Step 3: Implementar o repositório**

Em `src/modules/categoria/categoria.repository.ts`, acrescente à classe:

```ts
  /**
   * A categoria VIVA com esse nome, para esse dono.
   *
   * ⚠️ `deleted: { $ne: true }` não é detalhe: `getByFilter` do base não filtra
   * soft delete, então sem isso o service devolve 409 apontando para um
   * registro que o usuário não enxerga mais — e o índice parcial (que ignora os
   * excluídos) permitiria a criação. Service e índice discordariam.
   */
  async getAtivaByNomeEDono(nome: string, dono: string): Promise<Categoria> {
    return await this.model.findOne({ nome, dono, deleted: { $ne: true } });
  }
```

- [ ] **Step 4: Implementar o service**

Em `src/modules/categoria/categoria.service.ts`, substitua o `add` e o `validarPatternNome`:

```ts
  /**
   * ⚠️ `dono` é PARÂMETRO, nunca campo do DTO. Quem o define é a api, a partir
   * do JWT — mesma regra que o `cursinho-prova.controller` já aplica a
   * `criadorId`/`cursinhoId`. Com o dono vindo do corpo, o cursinho A criaria
   * categoria em nome do B mandando um campo a mais no JSON.
   */
  public async add(
    dto: CreateCategoriaDTOInput,
    dono: string = DONO_SYSTEM,
  ): Promise<Categoria> {
    const nomeAplicado = dto.nome ?? this.gerarNomeAuto(dto);

    // colisão ANTES do pattern: nomes seedados (ex.: "Enem Dia 1") não seguem
    // o pattern de categoria custom, então precisam bater 409 (não 400).
    const collision = await this.repository.getAtivaByNomeEDono(
      nomeAplicado,
      dono,
    );
    if (collision) {
      throw new ConflictException('Já existe uma categoria com esse nome');
    }

    this.validarPatternNome(nomeAplicado, dono);

    // backend é fonte de verdade: força os campos de segurança (ignora o DTO).
    const categoria = Object.assign(new Categoria(), dto, {
      nome: nomeAplicado,
      custom: true,
      selecionavel: true,
      dono,
    });

    return await this.repository.create(categoria);
  }
```

```ts
  /**
   * ⚠️ **Só vale para categoria da plataforma.** O pattern existe para o nome
   * ser autodescritivo numa lista global de dezenas de itens. Na lista de um
   * cursinho, com poucos itens e nomes que ele reconhece, ele custa mais do que
   * entrega — e impediria exatamente o caso de uso do ticket ("Enem Dia 1").
   */
  private validarPatternNome(nome: string, dono: string): void {
    if (dono !== DONO_SYSTEM) return;

    const pattern = /^(?:\S+\s+)*?(?:\d+q|livre)\s+\d+min$/;
    if (!pattern.test(nome)) {
      throw new BadRequestException(
        `Nome '${nome}' não segue o pattern '<Prefixo> <Nq>|livre <Dmin>' (ex.: 'Personalizado 30q 60min')`,
      );
    }
  }
```

Importe `DONO_SYSTEM` no topo:

```ts
import { Categoria, DONO_SYSTEM } from './schemas/categoria.schema';
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx jest src/modules/categoria/categoria.service.spec.ts
```

Esperado: PASS, incluindo os testes que já existiam no arquivo.

- [ ] **Step 6: Provar por mutação**

1. Trocar `dono` no `Object.assign` por `dto.dono ?? dono` → falha "grava o dono recebido".
2. Tirar o `if (dono !== DONO_SYSTEM) return;` → falha "o pattern NÃO vale".
3. Voltar `getAtivaByNomeEDono(nomeAplicado, dono)` para `getByFilter({ nome: nomeAplicado })` → falha "a colisão é por dono+nome".
4. Tirar `custom: true` → falha "continua custom".

- [ ] **Step 7: Commit**

```bash
git add src/modules/categoria/categoria.repository.ts src/modules/categoria/categoria.service.ts src/modules/categoria/categoria.service.spec.ts
git commit -m "feat(categoria): colisao por dono+nome e pattern so para o sistema

O \`dono\` e parametro do service, nunca campo do DTO -- mesma regra que o
cursinho-prova.controller ja aplica a criadorId/cursinhoId.

\`getAtivaByNomeEDono\` filtra soft delete: sem isso o service 409 num
registro invisivel enquanto o indice parcial permitiria a criacao."
```

---

### Task 3: listar por dono

**Files:**
- Modify: `src/modules/categoria/categoria.repository.ts`
- Modify: `src/modules/categoria/categoria.service.ts` (método `getAll`)
- Modify: `src/modules/categoria/categoria.controller.ts`
- Test: `src/modules/categoria/categoria.controller.spec.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/modules/categoria/categoria.controller.spec.ts`:

```ts
import { CategoriaController } from './categoria.controller';
import { DONO_SYSTEM } from './schemas/categoria.schema';

describe('CategoriaController — dono', () => {
  const service = {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    add: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn(),
  };
  const controller = new CategoriaController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('sem dono na query, lista as do sistema', async () => {
    await controller.getAll({ page: 1, limit: 40 } as never, undefined);
    expect(service.getAll).toHaveBeenCalledWith(
      { page: 1, limit: 40 },
      DONO_SYSTEM,
    );
  });

  it('com dono na query, repassa o dono', async () => {
    await controller.getAll({ page: 1, limit: 40 } as never, 'cur-1');
    expect(service.getAll).toHaveBeenCalledWith(
      { page: 1, limit: 40 },
      'cur-1',
    );
  });

  it('o POST repassa o dono do header, não do corpo', async () => {
    // ⚠️ Header e não body: o corpo é do cliente, o header é escrito pela api.
    await controller.post({ nome: 'X', dono: 'HACK' } as never, 'cur-1');
    expect(service.add).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'X' }),
      'cur-1',
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/categoria/categoria.controller.spec.ts
```

Esperado: FAIL — `getAll` do controller aceita 1 argumento.

- [ ] **Step 3: Implementar o repositório**

Em `src/modules/categoria/categoria.repository.ts`, o `getAll` já aceita `where`; nada muda ali.

Implemente o service — em `src/modules/categoria/categoria.service.ts`, substitua o `getAll`:

```ts
  public async getAll(
    param: GetAllInput,
    dono: string = DONO_SYSTEM,
  ): Promise<GetAllOutput<CategoriaOutputDTO>> {
    /**
     * ⚠️ O filtro é sempre aplicado — não existe "listar todas". Uma chamada
     * sem dono devolve as do sistema, e não o universo: um default permissivo
     * aqui vazaria as categorias de um cursinho para os outros no dia em que
     * alguém esquecesse de passar o parâmetro.
     */
    const result = await this.repository.getAll({ ...param, where: { dono } });
    return {
      ...result,
      data: await this.attachUsageCounts(result.data),
    };
  }
```

- [ ] **Step 4: Implementar o controller**

Em `src/modules/categoria/categoria.controller.ts`, troque `getAll` e `post`:

```ts
  public async getAll(
    @Query() query: GetAllDtoInput,
    /**
     * ⚠️ `@Query('dono')` avulso, e não campo do `GetAllDtoInput`. MEDIDO neste
     * projeto: com `transform: true`, o ValidationPipe instancia o DTO e os
     * inicializadores de classe entram sempre — um campo com default nunca
     * chega `undefined`, e o "não informado" deixaria de existir.
     */
    @Query('dono') dono?: string,
  ): Promise<GetAllDtoOutput<CategoriaOutputDTO>> {
    return await this.service.getAll(query, dono ?? DONO_SYSTEM);
  }
```

```ts
  public async post(
    @Body() model: CreateCategoriaDTOInput,
    /**
     * ⚠️ Header, não corpo. O corpo é escrito pelo cliente; este header é
     * escrito pela api a partir do JWT. Um `dono` no corpo seria assinado pelo
     * próprio cursinho.
     */
    @Headers('x-dono') dono?: string,
  ): Promise<Categoria> {
    return await this.service.add(model, dono ?? DONO_SYSTEM);
  }
```

Ajuste os imports do controller:

```ts
import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Categoria, DONO_SYSTEM } from './schemas/categoria.schema';
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx jest src/modules/categoria/
```

Esperado: PASS em todos os arquivos de `categoria/`.

- [ ] **Step 6: Provar por mutação**

1. Trocar `dono ?? DONO_SYSTEM` por `dono` no `getAll` → falha "sem dono na query".
2. No `post`, usar `model.dono ?? dono` → falha "repassa o dono do header".

- [ ] **Step 7: Commit**

```bash
git add src/modules/categoria/categoria.service.ts src/modules/categoria/categoria.controller.ts src/modules/categoria/categoria.controller.spec.ts
git commit -m "feat(categoria): listagem e criacao escopadas por dono

getAll SEMPRE filtra por dono -- sem dono informado, as do sistema. Um
default permissivo vazaria categoria de um cursinho para os outros no dia
em que alguem esquecesse o parametro."
```

---

### Task 4: o DELETE precisa checar o dono

**Files:**
- Modify: `src/modules/categoria/categoria.service.ts` (método `delete`)
- Modify: `src/modules/categoria/categoria.controller.ts` (rota `@Delete`)
- Test: `src/modules/categoria/categoria.service.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao `describe('CategoriaService — dono', ...)` de
`src/modules/categoria/categoria.service.spec.ts`:

```ts
  it('o cursinho A não apaga categoria do cursinho B', async () => {
    /**
     * ⚠️ Hoje o delete apaga por id e mais nada. Com categorias por dono, isso
     * é apagar registro alheio mandando um id — o id é público, aparece em
     * qualquer listagem.
     */
    repository.getById.mockResolvedValue({ _id: 'c1', dono: 'cur-B' });

    await expect(service.delete('c1', 'cur-A')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('o cursinho apaga a própria categoria', async () => {
    repository.getById.mockResolvedValue({ _id: 'c1', dono: 'cur-A' });
    await service.delete('c1', 'cur-A');
    expect(repository.delete).toHaveBeenCalledWith('c1');
  });

  it('o cursinho não apaga categoria do sistema', async () => {
    repository.getById.mockResolvedValue({ _id: 'c1', dono: DONO_SYSTEM });
    await expect(service.delete('c1', 'cur-A')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('o admin apaga a do sistema', async () => {
    repository.getById.mockResolvedValue({ _id: 'c1', dono: DONO_SYSTEM });
    await service.delete('c1', DONO_SYSTEM);
    expect(repository.delete).toHaveBeenCalledWith('c1');
  });
```

Importe `ForbiddenException` de `@nestjs/common` no topo do arquivo.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/categoria/categoria.service.spec.ts -t "não apaga categoria do cursinho B"
```

Esperado: FAIL — o delete resolve sem lançar.

- [ ] **Step 3: Implementar**

Em `src/modules/categoria/categoria.service.ts`, substitua o `delete`:

```ts
  public async delete(id: string, dono: string = DONO_SYSTEM): Promise<void> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }

    /**
     * ⚠️ **A verificação de dono vem ANTES da de uso.** Invertido, o cursinho A
     * descobriria, pela mensagem de erro, quantas provas e simulados o cursinho
     * B tem numa categoria dele.
     */
    if (categoria.dono !== dono) {
      throw new ForbiddenException('Categoria de outro dono');
    }

    const [simuladosUsando, provasUsando] = await Promise.all([
      this.simuladoRepository.countByCategoria(id),
      this.provaRepository.countByCategoria(id),
    ]);
    if (simuladosUsando > 0 || provasUsando > 0) {
      throw new ConflictException({
        message: 'Categoria em uso e não pode ser excluída',
        simuladosUsando,
        provasUsando,
      });
    }

    await this.repository.delete(id);
  }
```

Acrescente `ForbiddenException` aos imports de `@nestjs/common`.

No controller, `src/modules/categoria/categoria.controller.ts`:

```ts
  @Delete(':id')
  public async delete(
    @Param('id') id: string,
    @Headers('x-dono') dono?: string,
  ): Promise<void> {
    return await this.service.delete(id, dono ?? DONO_SYSTEM);
  }
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx jest src/modules/categoria/
```

Esperado: PASS.

- [ ] **Step 5: Provar por mutação**

1. Remover o bloco `if (categoria.dono !== dono)` → falham os três testes de negação.
2. Mover a checagem de dono para **depois** da contagem de uso → o teste "não apaga do cursinho B" continua passando; **é esperado**, e é por isso que o comentário sobre vazamento de contagem existe. Registre no PR que essa ordem não tem teste automático.

- [ ] **Step 6: Commit**

```bash
git add src/modules/categoria/categoria.service.ts src/modules/categoria/categoria.controller.ts src/modules/categoria/categoria.service.spec.ts
git commit -m "fix(categoria): delete verifica o dono antes de apagar

Hoje o delete apaga por id e mais nada -- com categorias por dono isso e
apagar registro alheio mandando um id, que e publico e aparece em qualquer
listagem. A verificacao vem antes da contagem de uso para nao vazar quantas
provas o outro cursinho tem."
```

---

### Task 5: a fábrica decide por dono, explicitamente

**Files:**
- Modify: `src/modules/prova/factory/prova_factory.ts:29-35`
- Test: `src/modules/prova/factory/prova_factory.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `src/modules/prova/factory/prova_factory.spec.ts`:

```ts
describe('ProvaFactory — categoria de cursinho', () => {
  it('categoria de cursinho vai para a CustomProvaFactory mesmo com custom false', () => {
    /**
     * ⚠️ Hoje o roteamento só olha `custom`, e funciona porque
     * `CategoriaService.add` força `custom: true`. É invariante IMPLÍCITA: um
     * endpoint de update, um seed ou uma correção manual no banco produziriam
     * uma categoria de cursinho com `custom: false` — e ela cairia na fábrica
     * do ENEM, criando 5 simulados para um cursinho que pediu 1.
     */
    const categoria = {
      custom: false,
      dono: 'cur-1',
      exame: { nome: 'ENEM' },
    } as never;

    const factory = provaFactory.getFactory(categoria, 2026);

    expect(factory).toBeInstanceOf(CustomProvaFactory);
  });

  it('categoria do sistema com exame ENEM continua na fábrica do ENEM', () => {
    // ⚠️ O par do teste acima: a mudança não pode desviar o fluxo do admin.
    const categoria = {
      custom: false,
      dono: DONO_SYSTEM,
      exame: { nome: 'ENEM' },
    } as never;

    const factory = provaFactory.getFactory(categoria, 2026);

    expect(factory).toBeInstanceOf(Enem2017PlusFactory);
  });
});
```

Importe no topo do arquivo, se faltar:

```ts
import { CustomProvaFactory } from './custom_prova_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';
import { DONO_SYSTEM } from 'src/modules/categoria/schemas/categoria.schema';
```

⚠️ Use a instância de `ProvaFactory` que o arquivo de spec já monta. Se ele não montar nenhuma,
construa com `new ProvaFactory(...)` passando `{} as never` em cada dependência — `getFactory` só
repassa referências, não chama nada.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/prova/factory/prova_factory.spec.ts
```

Esperado: FAIL — recebe `Enem2017PlusFactory` onde esperava `CustomProvaFactory`.

- [ ] **Step 3: Implementar**

Em `src/modules/prova/factory/prova_factory.ts`, troque o primeiro `if` de `getFactory`:

```ts
    /**
     * ⚠️ **`dono` entra na condição de propósito.** Toda prova de categoria de
     * cursinho gera 1 simulado — é a regra do produto.
     *
     * Na prática `custom` já basta hoje, porque `CategoriaService.add` o força
     * a `true`. Mas isso é invariante em OUTRO arquivo: um update futuro, um
     * seed ou um ajuste manual no banco produziriam categoria de cursinho com
     * `custom: false`, e ela cairia na fábrica do ENEM — 5 simulados para quem
     * pediu 1, sem erro nenhum. A condição explícita custa uma linha.
     */
    if (categoria.custom || categoria.dono !== DONO_SYSTEM) {
      return new CustomProvaFactory(
        this.questaoRepository,
        this.provaRepository,
        this.simuladoService,
        this.simuladoRepository,
        categoria,
      );
    }
```

Importe:

```ts
import { DONO_SYSTEM } from 'src/modules/categoria/schemas/categoria.schema';
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx jest src/modules/prova/factory/
```

Esperado: PASS em todos os specs de factory.

- [ ] **Step 5: Provar por mutação**

Voltar a condição para `if (categoria.custom)` → falha "categoria de cursinho vai para a
CustomProvaFactory".

- [ ] **Step 6: Commit**

```bash
git add src/modules/prova/factory/prova_factory.ts src/modules/prova/factory/prova_factory.spec.ts
git commit -m "feat(prova): fabrica roteia categoria de cursinho explicitamente

\`custom\` sozinho ja bastaria hoje, mas so porque CategoriaService.add o
forca -- invariante em outro arquivo. Um update futuro produziria categoria
de cursinho com custom false, que cairia na fabrica do ENEM e criaria 5
simulados para quem pediu 1."
```

---

### Task 6: script de migração 0003

**Files:**
- Create: `scripts/migrations/0003-categoria-dono/migrar.sh`
- Create: `scripts/migrations/0003-categoria-dono/README.md`

- [ ] **Step 1: Escrever o script**

Crie `scripts/migrations/0003-categoria-dono/migrar.sh`:

```bash
#!/usr/bin/env bash
#
# Migração 0003 — Categoria por dono.
#
# Conecta ao Mongo (índice não sai em mongoexport nem entra em mongoimport).
# Rodar ANTES do deploy do ms, em cada ambiente.
#
# Uso: MONGODB='mongodb://localhost:27017/simulado' bash migrar.sh
#
# Idempotente: rodar duas vezes dá o mesmo resultado.
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"

mongosh "$MONGODB" --quiet --eval '
  // ---- 1. Backfill. TEM que vir antes do índice: criar o composto com
  // documentos sem `dono` põe todos eles disputando a mesma chave.
  const semDono = db.categorias.updateMany(
    { dono: { $exists: false } },
    { $set: { dono: "system" } },
  );
  print("dono=system em " + semDono.modifiedCount + " categorias");

  // ---- 2. Backfill de `deleted`. O índice novo é parcial sobre
  // `{ deleted: false }`; documento sem o campo ficaria FORA do índice e
  // escaparia da unicidade — em silêncio.
  const semDeleted = db.categorias.updateMany(
    { deleted: { $exists: false } },
    { $set: { deleted: false } },
  );
  print("deleted=false em " + semDeleted.modifiedCount + " categorias");

  // ---- 3. Pré-check: duplicata (dono, nome) entre as VIVAS impede o unique.
  const dups = db.categorias.aggregate([
    { $match: { deleted: false } },
    { $group: { _id: { dono: "$dono", nome: "$nome" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  if (dups.length > 0) {
    print("ABORTADO: duplicatas (dono, nome) entre as vivas:");
    printjson(dups);
    quit(1);
  }

  // ---- 4. Dropar o unique global. autoIndex NÃO remove índice que saiu do
  // schema: sem este drop o unique de `nome` continua valendo no servidor e o
  // cursinho segue impedido de criar "Enem Dia 1" — sem erro em lugar nenhum,
  // porque o código novo está certo.
  try { db.categorias.dropIndex("nome_1"); print("drop nome_1 ok"); }
  catch (e) { print("nome_1 nao existe, ok"); }

  // ---- 5. O composto parcial.
  db.categorias.createIndex(
    { dono: 1, nome: 1 },
    { unique: true, partialFilterExpression: { deleted: false }, name: "dono_nome_unico" },
  );

  // ---- 6. Verificação: o que ficou.
  const nomes = db.categorias.getIndexes().map(i => i.name);
  print("indices: " + nomes.join(", "));
  if (nomes.includes("nome_1")) { print("ABORTADO: nome_1 ainda existe"); quit(1); }
  if (!nomes.includes("dono_nome_unico")) { print("ABORTADO: dono_nome_unico nao criado"); quit(1); }

  print("migracao 0003 OK");
'
```

- [ ] **Step 2: Escrever o README**

Crie `scripts/migrations/0003-categoria-dono/README.md`:

```markdown
# Migração 0003 — Categoria por dono

Roda **antes** do deploy do ms, em cada ambiente.

```bash
MONGODB='mongodb://...' bash migrar.sh
```

## O que faz

1. `dono: "system"` nas categorias existentes
2. `deleted: false` onde o campo não existe
3. Aborta se houver duplicata `(dono, nome)` entre as vivas
4. Dropa `nome_1`
5. Cria `dono_nome_unico` — `{dono, nome}`, unique, parcial sobre `deleted: false`
6. Verifica o resultado e aborta se estiver errado

## Por que o drop do passo 4 é obrigatório

`autoIndex` cria índice novo e **não remove** o que saiu do schema. Sem o drop, o unique global de
`nome` continua valendo no servidor: o cursinho A recebe 409 ao criar "Enem Dia 1" e **nada no código
explica por quê** — a aplicação está certa, quem barra é um índice que ninguém está mais olhando.

## Rollback

```bash
mongosh "$MONGODB" --eval '
  db.categorias.dropIndex("dono_nome_unico");
  db.categorias.createIndex({ nome: 1 }, { unique: true, name: "nome_1" });
'
```

⚠️ O rollback **falha** se já existirem duas categorias de donos diferentes com o mesmo nome — que é
justamente o estado que esta migração passa a permitir. A partir do momento em que o primeiro cursinho
criar uma categoria homônima, o caminho de volta exige decidir qual delas renomear.
```

- [ ] **Step 3: Verificar sintaxe**

```bash
bash -n scripts/migrations/0003-categoria-dono/migrar.sh && echo "sintaxe ok"
```

Esperado: `sintaxe ok`.

- [ ] **Step 4: Rodar contra um Mongo local, se houver**

```bash
MONGODB='mongodb://localhost:27017/simulado' bash scripts/migrations/0003-categoria-dono/migrar.sh
```

Esperado: as linhas de contagem e `migracao 0003 OK`. Rode **duas vezes** e confirme que a segunda
também termina em OK — é o teste de idempotência.

⚠️ Sem Mongo local, pule este passo e **registre no PR que a migração não foi executada**. Não
declare como testada.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrations/0003-categoria-dono/
git commit -m "chore(migration): 0003 categoria por dono

Backfill de dono e deleted, drop do nome_1 e criacao do composto parcial.
Aborta se houver duplicata (dono, nome) entre as vivas, e verifica o estado
final dos indices antes de declarar sucesso."
```

---

### Task 7: fechar a parte do ms

- [ ] **Step 1: Suíte completa**

```bash
npx jest
```

Esperado: verde. Anote o total de testes para o PR.

- [ ] **Step 2: Build**

```bash
npm run build
```

Esperado: sem erro.

⚠️ Confira que `dist/main.js` continua em `dist/` e não subiu de nível — `.ts` fora de `src/` move o
`rootDir` e quebra o PM2 com `Script not found /var/www/main.js`. Os arquivos de `scripts/` são `.sh`,
então não deve acontecer; confirme mesmo assim com `ls dist/main.js`.

- [ ] **Step 3: Lint dos arquivos tocados**

```bash
npx eslint src/modules/categoria/ src/modules/prova/factory/prova_factory.ts
```

⚠️ **Nunca `yarn lint`** — reformata o repositório inteiro.

- [ ] **Step 4: Abrir o PR**

```bash
git push -u origin feature/categoria-dono-cursinho
gh pr create --base develop --title "feat(categoria): categoria por cursinho — campo dono e unicidade escopada"
```

No corpo, registre: o que muda, a **migração obrigatória antes do deploy**, o achado do soft delete, e
que a ordem "dono antes de uso" no delete não tem teste automático.

---

# PARTE 2 — api-vcnafacul

```bash
cd api-vcnafacul
git checkout develop && git pull
git checkout -b feature/categoria-dono-cursinho
```

⚠️ **Não rode `yarn install`** sem necessidade — reescreve ~780 linhas do lockfile.

---

### Task 8: proxy de exame (destrava o cadastro da primeira categoria)

**Files:**
- Create: `src/modules/simulado/exame/exame.service.ts`
- Create: `src/modules/simulado/exame/exame.controller.ts`
- Modify: `src/modules/simulado/simulado.module.ts`
- Test: `src/modules/simulado/exame/exame.controller.spec.ts`

> ⚠️ **Por que esta task existe.** `ManageCategorias` monta o dropdown de exame derivando da lista de
> categorias. Com o recorte por dono, um cursinho novo tem zero categorias → zero exames → **não
> consegue criar a primeira**. O ms tem `GET /v1/exame`, a api não expõe.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/modules/simulado/exame/exame.controller.spec.ts`:

```ts
import { ExameProxyController } from './exame.controller';

describe('ExameProxyController', () => {
  it('lista os exames pelo ms', async () => {
    const service = {
      getAll: jest.fn().mockResolvedValue({ data: [{ nome: 'ENEM' }] }),
    };
    const controller = new ExameProxyController(service as never);

    const r = await controller.getAll();

    expect(service.getAll).toHaveBeenCalled();
    expect(r).toEqual({ data: [{ nome: 'ENEM' }] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/simulado/exame/exame.controller.spec.ts
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o service**

Crie `src/modules/simulado/exame/exame.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { EnvService } from 'src/shared/modules/env/env.service';
import {
  HttpServiceAxios,
  HttpServiceAxiosFactory,
} from 'src/shared/services/axios/http-service-axios.factory';

@Injectable()
export class ExameProxyService {
  private readonly axios: HttpServiceAxios;

  constructor(
    private readonly httpServiceFactory: HttpServiceAxiosFactory,
    private readonly envService: EnvService,
  ) {
    this.axios = this.httpServiceFactory.create(
      this.envService.get('SIMULADO_URL'),
    );
  }

  async getAll() {
    return await this.axios.get('v1/exame');
  }
}
```

- [ ] **Step 4: Implementar o controller**

Crie `src/modules/simulado/exame/exame.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { ExameProxyService } from './exame.service';

/**
 * ⚠️ **Só leitura, e sem permissão específica.** A lista de exames é um
 * catálogo pequeno e público entre usuários autenticados — quem monta uma
 * categoria precisa dela para escolher o exame, e sem isso um cursinho novo
 * não consegue criar a primeira categoria.
 */
@ApiTags('Simulado - Exame')
@Controller('mssimulado/exame')
export class ExameProxyController {
  constructor(private readonly exameService: ExameProxyService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, description: 'lista os exames' })
  async getAll() {
    return await this.exameService.getAll();
  }
}
```

- [ ] **Step 5: Registrar no módulo**

Em `src/modules/simulado/simulado.module.ts`, acrescente aos imports, à lista de `controllers` e à de
`providers`:

```ts
import { ExameProxyController } from './exame/exame.controller';
import { ExameProxyService } from './exame/exame.service';
```

`controllers: [ ..., ExameProxyController ]` e `providers: [ ..., ExameProxyService ]`.

- [ ] **Step 6: Rodar e ver passar**

```bash
npx jest src/modules/simulado/exame/
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/simulado/exame/ src/modules/simulado/simulado.module.ts
git commit -m "feat(exame): proxy de leitura de v1/exame

Sem isto um cursinho novo nao consegue criar a primeira categoria: o
dropdown de exame do ManageCategorias e derivado da lista de categorias, e
com o recorte por dono essa lista comeca vazia."
```

---

### Task 9: permissão nova

**Files:**
- Modify: `src/modules/role/permissions/permissions.ts`
- Modify: `src/modules/role/role.entity.ts:124`
- Create: `src/db/migrations/<timestamp>-add_permissao_categorias_cursinho.ts`

- [ ] **Step 1: Adicionar ao enum**

Em `src/modules/role/permissions/permissions.ts`, depois de `cadastrarProvasCursinho`:

```ts
  gerenciarCategoriasCursinho = 'gerenciar_categorias_cursinho',
```

- [ ] **Step 2: Adicionar a coluna à entidade**

Em `src/modules/role/role.entity.ts`, depois do bloco de `cadastrarProvasCursinho` (linha ~124):

```ts
  @Column({ name: Permissions.gerenciarCategoriasCursinho, default: false })
  gerenciarCategoriasCursinho: boolean;
```

⚠️ Padrão do projeto: **tipo novo de usuário vira coluna booleana em `roles`**, não role nova.

- [ ] **Step 3: Criar a migration**

```bash
npm run migration:generate -n AddPermissaoCategoriasCursinho
```

⚠️ **Só rode com `host=localhost` no `.env`.** Todos os `.env` deste workspace apontam para homologação
— gerar migration contra homol é escrever no banco compartilhado.

Se preferir escrever à mão, crie
`src/db/migrations/<timestamp>-add_permissao_categorias_cursinho.ts` no molde do
`1785617601022-add_permissoes_provas_cursinho.ts`:

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPermissaoCategoriasCursinho<timestamp> implements MigrationInterface {
    name = 'AddPermissaoCategoriasCursinho<timestamp>'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`roles\` ADD \`gerenciar_categorias_cursinho\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`roles\` DROP COLUMN \`gerenciar_categorias_cursinho\``);
    }
}
```

Substitua `<timestamp>` pelo mesmo número do nome do arquivo.

- [ ] **Step 4: Verificar que compila**

```bash
npm run build
```

Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/modules/role/permissions/permissions.ts src/modules/role/role.entity.ts src/db/migrations/
git commit -m "feat(role): permissao gerenciar_categorias_cursinho

Coluna booleana em roles, seguindo o padrao do projeto -- nao role nova.
Nao reusa alterarPermissao, que e administracao de papeis e nao tem relacao
com gerenciar categoria."
```

---

### Task 10: controller de categoria do cursinho

**Files:**
- Modify: `src/modules/simulado/categoria/categoria.service.ts`
- Create: `src/modules/simulado/categoria/cursinho/cursinho-categoria.controller.ts`
- Modify: `src/modules/simulado/categoria/categoria.controller.ts`
- Modify: `src/modules/simulado/simulado.module.ts`
- Test: `src/modules/simulado/categoria/cursinho/cursinho-categoria.controller.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/modules/simulado/categoria/cursinho/cursinho-categoria.controller.spec.ts`:

```ts
import { CursinhoCategoriaController } from './cursinho-categoria.controller';

describe('CursinhoCategoriaController', () => {
  const categoriaService = {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const cursinhoResolver = {
    resolveCursinhoIdByUserId: jest.fn().mockResolvedValue('cur-1'),
  };
  const controller = new CursinhoCategoriaController(
    categoriaService as never,
    cursinhoResolver as never,
  );
  const req = { user: { id: 'u1' } } as never;

  beforeEach(() => jest.clearAllMocks());

  it('GET lista só as do cursinho resolvido pelo JWT', async () => {
    await controller.getAll(req, '1', '40');
    expect(cursinhoResolver.resolveCursinhoIdByUserId).toHaveBeenCalledWith('u1');
    expect(categoriaService.getAll).toHaveBeenCalledWith('1', '40', 'cur-1');
  });

  it('POST injeta o dono resolvido, ignorando o corpo', async () => {
    /**
     * ⚠️ A garantia de isolamento, no mesmo molde do cursinho-prova.controller:
     * o cliente não decide de quem é o registro.
     */
    await controller.create({ nome: 'Enem Dia 1', dono: 'HACK' } as never, req);
    expect(categoriaService.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Enem Dia 1' }),
      'cur-1',
    );
  });

  it('DELETE passa o dono, para o ms recusar categoria alheia', async () => {
    await controller.delete('cat-9', req);
    expect(categoriaService.delete).toHaveBeenCalledWith('cat-9', 'cur-1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest src/modules/simulado/categoria/cursinho/
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Estender o proxy service**

Em `src/modules/simulado/categoria/categoria.service.ts`, troque os três métodos:

```ts
  async getAll(page: number, limit: number, dono: string) {
    return await this.axios.get(
      `v1/categoria?page=${page}&limit=${limit}&dono=${encodeURIComponent(dono)}`,
    );
  }

  /**
   * ⚠️ O `dono` viaja no header `x-dono`, não no corpo. O corpo é escrito pelo
   * cliente; este header é escrito aqui, a partir do JWT.
   *
   * ⚠️ **Headers como `Record` simples, NÃO um config do axios.** MEDIDO: a
   * assinatura do wrapper é `post<T>(url, body?, headers?)` e
   * `delete<T>(url, headers?)`. Passar `{ headers: { 'x-dono': dono } }` — o
   * reflexo natural de quem conhece axios — envia um header **chamado
   * `headers`**: o ms nunca vê o `x-dono`, cai no default `'system'`, e toda
   * categoria de cursinho nasce como categoria da plataforma. Sem erro nenhum.
   */
  async create(dto: CreateCategoriaDtoInput, dono: string) {
    return await this.axios.post('v1/categoria', dto, { 'x-dono': dono });
  }

  async delete(id: string, dono: string) {
    return await this.axios.delete(`v1/categoria/${id}`, { 'x-dono': dono });
  }
```

⚠️ **Cubra o repasse do header com teste.** É a única coisa que separa "mandou o dono" de "mandou
alguma coisa" — e o modo de falhar aqui é silencioso, não é exceção.

- [ ] **Step 4: Implementar o controller**

Crie `src/modules/simulado/categoria/cursinho/cursinho-categoria.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Permissions } from 'src/modules/role/permissions/permissions';
import { User } from 'src/modules/user/user.entity';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/shared/guards/permission.guard';
import { CursinhoResolverService } from '../../prova/cursinho/cursinho-resolver.service';
import { CreateCategoriaDtoInput } from '../dtos/create-categoria.dto.input';
import { CategoriaProxyService } from '../categoria.service';

/**
 * Categorias de um cursinho.
 *
 * ⚠️ **O dono vem SEMPRE do JWT, nunca do corpo.** Mesma regra que o
 * `cursinho-prova.controller` já aplica a `criadorId`/`cursinhoId`, e pelo mesmo
 * motivo: o cliente não decide de quem é o registro.
 */
@ApiTags('Simulado - Categoria Cursinho')
@Controller('mssimulado/cursinho/categoria')
export class CursinhoCategoriaController {
  constructor(
    private readonly categoriaService: CategoriaProxyService,
    private readonly cursinhoResolver: CursinhoResolverService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'lista categorias do cursinho' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetMetadata(PermissionsGuard.name, Permissions.visualizarProvasCursinho)
  async getAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const cursinhoId = await this.cursinhoResolver.resolveCursinhoIdByUserId(
      (req.user as User).id,
    );
    return await this.categoriaService.getAll(page, limit, cursinhoId);
  }

  @Post()
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'cria categoria do cursinho' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetMetadata(PermissionsGuard.name, Permissions.gerenciarCategoriasCursinho)
  async create(@Body() dto: CreateCategoriaDtoInput, @Req() req: Request) {
    const cursinhoId = await this.cursinhoResolver.resolveCursinhoIdByUserId(
      (req.user as User).id,
    );
    return await this.categoriaService.create(dto, cursinhoId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'exclui categoria do cursinho' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetMetadata(PermissionsGuard.name, Permissions.gerenciarCategoriasCursinho)
  async delete(@Param('id') id: string, @Req() req: Request) {
    const cursinhoId = await this.cursinhoResolver.resolveCursinhoIdByUserId(
      (req.user as User).id,
    );
    return await this.categoriaService.delete(id, cursinhoId);
  }
}
```

⚠️ Ajuste os tipos de `page`/`limit` no `CategoriaProxyService.getAll` para `string | undefined`, no
mesmo molde documentado em `prova.service.ts` — o querystring chega cru, e o `if` que omite o ausente
evita mandar a string `"undefined"` ao ms.

- [ ] **Step 5: Admin injeta `'system'`**

Em `src/modules/simulado/categoria/categoria.controller.ts`, atualize as três chamadas:

```ts
  async getAll(@Query() query: GetAllDtoInput) {
    return await this.categoriaService.getAll(query.page, query.limit, DONO_SYSTEM);
  }
```

```ts
  async create(@Body() dto: CreateCategoriaDtoInput) {
    return await this.categoriaService.create(dto, DONO_SYSTEM);
  }
```

```ts
  async delete(@Param('id') id: string) {
    return await this.categoriaService.delete(id, DONO_SYSTEM);
  }
```

Declare a constante no topo do arquivo — a api não importa do ms:

```ts
/** Espelha `DONO_SYSTEM` do ms-simulado. Valor de contrato entre os dois. */
const DONO_SYSTEM = 'system';
```

- [ ] **Step 6: Registrar no módulo**

Em `src/modules/simulado/simulado.module.ts`:

```ts
import { CursinhoCategoriaController } from './categoria/cursinho/cursinho-categoria.controller';
```

Acrescente `CursinhoCategoriaController` à lista de `controllers`. `CursinhoResolverService` já está
nos providers.

- [ ] **Step 7: Rodar e ver passar**

```bash
npx jest src/modules/simulado/categoria/
```

Esperado: PASS.

- [ ] **Step 8: Provar por mutação**

1. No POST, usar `dto.dono ?? cursinhoId` → falha "injeta o dono resolvido".
2. No DELETE, chamar `delete(id)` sem o dono → falha "passa o dono".
3. Trocar `gerenciarCategoriasCursinho` por `alterarPermissao` no `@SetMetadata` → **não falha**, os
   testes chamam o método direto e não passam pelo guard. Registre no PR que a permissão de cada rota
   é verificação manual.

- [ ] **Step 9: Verificar colisão de rota**

⚠️ `mssimulado/cursinho/categoria` e `mssimulado/categoria/:id` são controllers diferentes; a ordem no
array de `controllers` do módulo decide qual casa primeiro. Confirme com um teste de rota real:

```bash
npx jest src/modules/simulado/categoria/
```

Se não houver teste montando app com `Test.createTestingModule` + supertest, escreva um: é a única
forma de pegar colisão literal × `:param`. Este repositório já tem o molde em
`src/modules/simulado/questao/questao-rotas.controller.spec.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/modules/simulado/categoria/ src/modules/simulado/simulado.module.ts
git commit -m "feat(categoria): rotas de categoria por cursinho

Dono resolvido pelo JWT e enviado ao ms no header x-dono -- nunca no corpo.
Admin injeta 'system'. Delete repassa o dono para o ms recusar categoria
alheia."
```

---

### Task 11: fechar a parte da api

- [ ] **Step 1: Testes**

```bash
npm run test:local
```

⚠️ Precisa de MySQL na porta 3307. Sem ele, use `npm run test`, que sobe Docker.

⚠️ **Falhas pré-existentes, não relacionadas:** `student-course.e2e-spec.ts` (faker gera emails
duplicados) e `inscription-course.e2e-spec.ts` (timezone/DST). Se falharem, confirme que falham
também na `develop` antes de investigar.

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: PR**

```bash
git push -u origin feature/categoria-dono-cursinho
gh pr create --base develop --title "feat(categoria): rotas de categoria por cursinho + proxy de exame"
```

Registre no corpo: a migration de permissão, a dependência do PR do ms, e os dois pontos sem teste
automático (permissão por rota e ordem das checagens no delete).

---

# PARTE 3 — client-vcnafacul

```bash
cd client-vcnafacul
git checkout develop && git pull
git checkout -b feature/categoria-dono-cursinho
```

⚠️ **Antes de abrir o PR, use a skill `abrir-pr`** (`.claude/skills/abrir-pr/SKILL.md`): o CI roda
`yarn test:ci`, que **exclui** `DashToolbar.test.tsx`. Só o `yarn test` local cobre aqueles 22 testes.

---

### Task 12: enum, urls e serviços

**Files:**
- Modify: `src/enums/roles/roles.ts:31`
- Modify: `src/services/urls.ts:52`
- Create: `src/services/exame/getExames.ts`
- Create: `src/services/categoria/getCategoriasCursinho.ts`
- Create: `src/services/categoria/createCategoriaCursinho.ts`
- Create: `src/services/categoria/deleteCategoriaCursinho.ts`

- [ ] **Step 1: Enum e urls**

Em `src/enums/roles/roles.ts`, depois de `cadastrarProvasCursinho`:

```ts
  gerenciarCategoriasCursinho = "gerenciarCategoriasCursinho",
```

Em `src/services/urls.ts`, depois da linha de `categoriaById`:

```ts
export const cursinhoCategoria = `${mssimulado}/cursinho/categoria`;
export const cursinhoCategoriaById = (id: string) => `${cursinhoCategoria}/${id}`;
export const exame = `${mssimulado}/exame`;
```

- [ ] **Step 2: Serviço de exame**

Crie `src/services/exame/getExames.ts`:

```ts
import { IExameRef } from "../../dtos/categoria/categoria";
import fetchWrapper from "../../utils/fetchWrapper";
import { Paginate } from "../../utils/paginate";
import { exame } from "../urls";

/**
 * ⚠️ Existe porque o dropdown de exame do `ManageCategorias` era derivado da
 * lista de categorias. Com o recorte por dono, um cursinho novo tem zero
 * categorias — e ficaria sem nenhum exame para escolher, sem conseguir criar a
 * primeira.
 *
 * ⚠️ A resposta é **envelope paginado**, não array: quem consome lê `.data`.
 */
export async function getExames(token: string): Promise<Paginate<IExameRef>> {
  /**
   * ⚠️ `limit=500` explícito. MEDIDO na Task 8: `v1/exame` do ms usa
   * `GetAllDtoInput`, então sem parâmetro o teto é **40** e a resposta é um
   * envelope paginado — não um array. Hoje são poucos exames, mas passando de
   * 40 o dropdown truncaria **sem erro nenhum**. 500 é o `LIMITE_MAXIMO` do ms.
   */
  const response = await fetchWrapper(`${exame}?page=1&limit=500`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const res = await response.json();
  if (response.status !== 200) {
    throw new Error(`Erro ao buscar exames ${res.message}`);
  }
  return res;
}
```

- [ ] **Step 3: Serviços de categoria do cursinho**

Crie `src/services/categoria/getCategoriasCursinho.ts`:

```ts
import { ICategoria } from "../../dtos/categoria/categoria";
import fetchWrapper from "../../utils/fetchWrapper";
import { Paginate } from "../../utils/paginate";
import { cursinhoCategoria } from "../urls";

/**
 * ⚠️ O cursinho é resolvido pelo JWT na api — não vai parâmetro nenhum daqui.
 * É o que garante que um cursinho não liste categoria de outro nem alterando a
 * requisição.
 */
export async function getCategoriasCursinho(
  token: string,
): Promise<Paginate<ICategoria>> {
  const response = await fetchWrapper(`${cursinhoCategoria}?page=1&limit=500`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error(`${response.status} - Erro ao buscar categorias do cursinho`);
}
```

Crie `src/services/categoria/createCategoriaCursinho.ts`:

```ts
import { ICategoria } from "../../dtos/categoria/categoria";
import fetchWrapper from "../../utils/fetchWrapper";
import { cursinhoCategoria } from "../urls";

/**
 * ⚠️ **Aqui `nome` É enviado**, ao contrário do `createCategoria` do admin, que
 * deixa o backend gerar pelo pattern `<Prefixo> <Nq>|livre <Dmin>`. É o ponto
 * inteiro do ticket: o cursinho nomeia como quiser, inclusive "Enem Dia 1".
 *
 * ⚠️ `dono` NÃO viaja daqui. Quem o define é a api, a partir do JWT — mandar
 * um `dono` no corpo seria o cursinho assinando o próprio registro.
 */
export interface CreateCategoriaCursinhoInput {
  nome: string;
  exame: string;
  duracao: number;
  quantidadeTotalQuestao: number | null;
  descricao?: string;
}

export async function createCategoriaCursinho(
  input: CreateCategoriaCursinhoInput,
  token: string,
): Promise<ICategoria> {
  const response = await fetchWrapper(cursinhoCategoria, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (response.status === 201) {
    return await response.json();
  }

  const err = await response.json();
  if (response.status === 409) {
    throw new Error(err.message || "Você já tem uma categoria com esse nome");
  }
  if (response.status === 400) {
    throw new Error(err.message || "Dados inválidos");
  }
  throw new Error("Erro ao criar categoria");
}
```

Crie `src/services/categoria/deleteCategoriaCursinho.ts`:

```ts
import fetchWrapper from "../../utils/fetchWrapper";
import { cursinhoCategoriaById } from "../urls";

export async function deleteCategoriaCursinho(
  id: string,
  token: string,
): Promise<void> {
  const response = await fetchWrapper(cursinhoCategoriaById(id), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 200 || response.status === 204) {
    return;
  }

  if (response.status === 409) {
    const err = await response.json();
    const partes: string[] = [];
    if (err.simuladosUsando > 0) partes.push(`${err.simuladosUsando} simulados`);
    if (err.provasUsando > 0) partes.push(`${err.provasUsando} provas`);
    const detalhes =
      partes.length > 0 ? `${partes.join(" e ")} usam essa categoria` : err.message;
    throw new Error(`Categoria em uso — ${detalhes}`);
  }
  /**
   * ⚠️ 403 é novo neste fluxo: o ms recusa excluir categoria de outro dono.
   * Sem esta linha a pessoa recebe "Erro ao excluir categoria" e não entende.
   */
  if (response.status === 403) {
    throw new Error("Essa categoria não é do seu cursinho");
  }
  throw new Error("Erro ao excluir categoria");
}
```

⚠️ A assinatura `(input, token)` e `(id, token)` é **a mesma** dos serviços do admin, de propósito: é o
que permite o `ManageCategorias` da Task 13 receber os dois pares pela mesma prop.

- [ ] **Step 4: Verificar que compila**

```bash
yarn build && git checkout -- tsconfig.app.tsbuildinfo
```

Esperado: `built in ...`, sem erro de TS.

- [ ] **Step 5: Commit**

```bash
git add src/enums/roles/roles.ts src/services/urls.ts src/services/exame/ src/services/categoria/
git commit -m "feat(categoria): servicos escopados por cursinho e listagem de exames

getExames existe porque o dropdown de exame era derivado da lista de
categorias -- com o recorte por dono, cursinho novo comeca com a lista
vazia e nao conseguiria criar a primeira categoria."
```

---

### Task 13: `ManageCategorias` recebe os serviços por prop

**Files:**
- Modify: `src/pages/dashProvas/modals/manageCategorias/index.tsx`
- Test: `src/pages/dashProvas/modals/manageCategorias/index.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/pages/dashProvas/modals/manageCategorias/index.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getExames = vi.hoisted(() =>
  vi.fn(async () => ({ data: [{ _id: "e1", nome: "ENEM" }] })),
);
vi.mock("../../../../services/exame/getExames", () => ({ getExames }));
vi.mock("../../../../store/auth", () => ({
  useAuthStore: () => ({ data: { token: "tok" } }),
}));
vi.mock("react-toastify", () => ({ toast: { error: vi.fn() } }));

import ManageCategorias from "./index";

const listar = vi.fn(async () => ({ data: [] }));

beforeEach(() => {
  listar.mockClear();
  getExames.mockClear();
});

async function montar() {
  const utils = render(
    <ManageCategorias
      isOpen
      handleClose={vi.fn()}
      onCategoriasChanged={vi.fn()}
      listarService={listar}
      criarService={vi.fn()}
      excluirService={vi.fn()}
    />,
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

describe("ManageCategorias", () => {
  it("lista pelo serviço recebido, não por um import fixo", async () => {
    // ⚠️ É o que permite a mesma tela servir admin e cursinho sem um `if`
    // dentro do modal perguntando em que página ele está.
    await montar();
    expect(listar).toHaveBeenCalledWith("tok");
  });

  it("busca os exames no endpoint, não na lista de categorias", async () => {
    /**
     * ⚠️ O bug que esta task conserta: com a lista de categorias vazia — que é
     * o estado de TODO cursinho novo — o dropdown de exame ficava vazio e não
     * dava para criar a primeira categoria.
     */
    await montar();
    expect(getExames).toHaveBeenCalledWith("tok");
    expect(listar).toHaveBeenCalled();
    expect((await screen.findAllByText(/ENEM/)).length).toBeGreaterThan(0);
  });
});
```

⚠️ O último `expect` depende de o exame aparecer em tela na view de lista. Se a view "lista" não
mostrar exame, troque por abrir a view "criar" antes de asseverar, ou remova essa linha e mantenha só
a asserção sobre `getExames`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/pages/dashProvas/modals/manageCategorias/index.test.tsx
```

Esperado: FAIL — o componente não aceita `listarService`.

- [ ] **Step 3: Implementar**

Em `src/pages/dashProvas/modals/manageCategorias/index.tsx`:

Estenda as props:

```tsx
interface ManageCategoriasProps {
  isOpen: boolean;
  handleClose: () => void;
  onCategoriasChanged: (categorias: ICategoria[]) => void;
  /**
   * ⚠️ Serviços por prop, e não `if` interno. O mesmo modal serve a dash da
   * administração e a do cursinho; um `if` aqui obrigaria o modal a saber em
   * que tela está, que é exatamente a dependência que se evita.
   *
   * Opcionais para o `dashProvas` seguir chamando sem mudar nada.
   */
  listarService?: (token: string) => Promise<{ data: ICategoria[] }>;
  criarService?: typeof createCategoria;
  excluirService?: typeof deleteCategoria;
}
```

No corpo, resolva os defaults e troque a origem dos exames:

```tsx
  const listar = listarService ?? getCategorias;
  const criar = criarService ?? createCategoria;
  const excluir = excluirService ?? deleteCategoria;

  const [exames, setExames] = useState<ExameOption[]>([]);

  useEffect(() => {
    listar(token)
      .then((res) => setCategorias(res.data))
      .catch((erro: Error) => toast.error(erro.message));
  }, [token, listar]);

  /**
   * ⚠️ Os exames vêm do endpoint, e NÃO mais derivados de `categorias`. Com o
   * recorte por dono, um cursinho novo tem zero categorias — e derivar dali
   * deixaria o dropdown vazio, impedindo a criação da primeira.
   */
  useEffect(() => {
    getExames(token)
      .then((res) =>
        setExames(res.data.map((e) => ({ value: e._id, label: e.nome }))),
      )
      .catch((erro: Error) => toast.error(erro.message));
  }, [token]);
```

Remova o `useMemo` de `exameOptions` e passe `exames` onde ele era usado. Substitua as chamadas
diretas a `createCategoria`/`deleteCategoria` por `criar`/`excluir`.

⚠️ `listar` entra no array de dependências do `useEffect`. Se a tela chamadora passar uma função
inline, ela muda de identidade a cada render e o efeito vira laço infinito — **defina o serviço fora
do componente ou com `useCallback`** nas telas da Task 14.

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/pages/dashProvas/modals/manageCategorias/index.test.tsx
```

Esperado: PASS, 2 testes.

- [ ] **Step 5: Provar por mutação**

1. Trocar `listar` por `getCategorias` fixo → falha "lista pelo serviço recebido".
2. Voltar os exames a derivar de `categorias` → falha "busca os exames no endpoint".

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashProvas/modals/manageCategorias/
git commit -m "refactor(manageCategorias): servicos por prop e exames pelo endpoint

Os exames deixam de ser derivados da lista de categorias -- com o recorte
por dono, cursinho novo comeca com a lista vazia e o dropdown ficaria sem
opcao, impedindo criar a primeira categoria."
```

---

### Task 14: modo de nome livre no formulário

**Files:**
- Modify: `src/pages/dashProvas/modals/manageCategorias/createForm.tsx`
- Modify: `src/pages/dashProvas/modals/manageCategorias/index.tsx` (repassa a prop)
- Test: `src/pages/dashProvas/modals/manageCategorias/createForm.test.tsx` (criar)

> ⚠️ **Por que existe.** O formulário coleta `prefixo`, não nome, e o `createCategoria` do admin nem
> envia `nome` — o backend gera pelo pattern. Sem um modo de nome livre, a Task 2 (que dispensa o
> pattern para cursinho) não tem como ser exercida pela interface, e o cursinho **não consegue criar
> "Enem Dia 1"**, que é o caso de uso do ticket.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/pages/dashProvas/modals/manageCategorias/createForm.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreateForm from "./createForm";

const EXAMES = [{ value: "e1", label: "ENEM" }];

function montar(props: Record<string, unknown> = {}) {
  return render(
    <CreateForm
      exames={EXAMES}
      onCancel={vi.fn()}
      onCreated={vi.fn()}
      {...props}
    />,
  );
}

describe("CreateForm", () => {
  it("no modo padrão pede prefixo e mostra o preview do nome gerado", () => {
    // ⚠️ O par do teste abaixo: o comportamento do admin não pode mudar.
    montar();
    expect(screen.getByLabelText(/Prefixo/i)).toBeInTheDocument();
    expect(screen.getByText(/Preview do nome/i)).toBeInTheDocument();
  });

  it("no modo de nome livre pede nome e NÃO mostra preview", () => {
    /**
     * ⚠️ O preview espelha o pattern do backend. Com nome livre não há pattern
     * a espelhar — mantê-lo mostraria à pessoa um nome que não é o que ela vai
     * receber, que é pior do que não mostrar nada.
     */
    montar({ nomeLivre: true });
    expect(screen.getByLabelText(/Nome/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Prefixo/i)).toBeNull();
    expect(screen.queryByText(/Preview do nome/i)).toBeNull();
  });

  it("no modo de nome livre, o nome digitado vai no campo `nome` do payload", async () => {
    const criar = vi.fn().mockResolvedValue({ _id: "c1", nome: "Enem Dia 1" });
    montar({ nomeLivre: true, criarService: criar });

    fireEvent.change(screen.getByLabelText(/Nome/i), {
      target: { value: "Enem Dia 1" },
    });
    fireEvent.change(screen.getByLabelText(/Duração/i), {
      target: { value: "330" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Criar/i }));

    expect(criar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Enem Dia 1" }),
      expect.any(String),
    );
    // ⚠️ `prefixo` no payload faria o backend ignorar o nome e gerar pelo
    // pattern — a pessoa digitaria "Enem Dia 1" e receberia outra coisa.
    expect(criar.mock.calls[0][0]).not.toHaveProperty("prefixo");
  });

  it("no modo de nome livre, nome vazio não envia nada", () => {
    const criar = vi.fn();
    montar({ nomeLivre: true, criarService: criar });
    fireEvent.click(screen.getByRole("button", { name: /Criar/i }));
    expect(criar).not.toHaveBeenCalled();
  });
});
```

⚠️ **Leia `createForm.tsx` inteiro antes de escrever o teste.** Os nomes de `label`, o texto do botão
e as props (`exames`, `onCancel`, `onCreated`, `criarService`) precisam bater com o que o componente
realmente expõe hoje — ajuste os seletores acima ao que estiver lá, sem mudar o que cada teste afirma.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/pages/dashProvas/modals/manageCategorias/createForm.test.tsx
```

Esperado: FAIL nos dois testes de nome livre — o componente não conhece `nomeLivre`.

- [ ] **Step 3: Implementar**

Em `createForm.tsx`, acrescente a prop:

```tsx
interface CreateFormProps {
  // ... as props que já existem
  /**
   * ⚠️ Nome livre em vez de prefixo + pattern.
   *
   * O backend só dispensa o pattern para categoria de cursinho
   * (`validarPatternNome` retorna cedo quando `dono !== 'system'`). Ligar isto
   * na tela do admin produziria 400 no envio, com o formulário sem nada que
   * explicasse por quê.
   */
  nomeLivre?: boolean;
}
```

Adicione o estado e o campo:

```tsx
  const [nome, setNome] = useState("");
```

No JSX, troque o bloco do prefixo por um condicional:

```tsx
  {nomeLivre ? (
    <label>
      Nome
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Ex.: Enem Dia 1"
      />
    </label>
  ) : (
    /* o bloco do prefixo, exatamente como está hoje */
  )}
```

E esconda o preview quando `nomeLivre` for verdadeiro — ele espelha um pattern que não se aplica.

No handler de submissão, monte o payload conforme o modo:

```tsx
    if (nomeLivre) {
      if (!nome.trim()) return;
      input.nome = nome.trim();
    } else if (prefixo.trim()) {
      input.prefixo = prefixo.trim();
    }
```

⚠️ `nome` e `prefixo` são **mutuamente exclusivos** no payload. Mandar os dois faz o backend usar
`dto.nome ?? gerarNomeAuto(dto)` — o nome vence, o prefixo vira campo morto, e quem lê o código depois
não sabe qual dos dois manda.

Em `index.tsx`, repasse:

```tsx
  <CreateForm
    exames={exames}
    nomeLivre={!!listarService}
    criarService={criar}
    /* ... */
  />
```

⚠️ `!!listarService` como sinal de "é a tela do cursinho" é frágil — se um dia o admin passar
serviços, o modo muda sozinho. Prefira uma prop explícita `nomeLivre` no `ManageCategorias`, repassada
pela tela, e passe `nomeLivre` na Task 15.

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/pages/dashProvas/modals/manageCategorias/
```

Esperado: PASS, incluindo os 2 testes da Task 13.

- [ ] **Step 5: Provar por mutação**

1. Ignorar a prop e sempre pedir prefixo → falham os dois testes de nome livre.
2. Enviar `prefixo` junto com `nome` → falha "não toHaveProperty('prefixo')".
3. Tirar o `if (!nome.trim()) return;` → falha "nome vazio não envia nada".
4. Mostrar o preview também no modo livre → falha "NÃO mostra preview".

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashProvas/modals/manageCategorias/
git commit -m "feat(manageCategorias): modo de nome livre para categoria de cursinho

O form coletava prefixo e o backend gerava o nome pelo pattern. O cursinho
precisa digitar 'Enem Dia 1' literalmente -- sem isso a dispensa do pattern
no backend nao tem como ser exercida pela interface.

nome e prefixo sao mutuamente exclusivos no payload: mandar os dois faz o
nome vencer e o prefixo virar campo morto."
```

---

### Task 15: a tela do cursinho usa as rotas escopadas

**Files:**
- Modify: `src/pages/partnerPrepProvas/index.tsx`
- Test: `src/pages/partnerPrepProvas/index.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `src/pages/partnerPrepProvas/index.test.tsx` um `describe` novo, e adicione os mocks no
topo do arquivo, junto dos que já existem:

```tsx
const getCategoriasCursinho = vi.hoisted(() =>
  vi.fn(async () => ({ data: [] })),
);
vi.mock("../../services/categoria/getCategoriasCursinho", () => ({
  getCategoriasCursinho,
}));
```

```tsx
describe("categorias do cursinho", () => {
  it("busca as categorias pela rota do cursinho, nunca pela global", async () => {
    /**
     * ⚠️ O par do teste de provas: se a tela chamar `getCategorias`, o cursinho
     * vê "Enem Dia 1" e "Enem Dia 2" da plataforma no modal de Nova Prova — que
     * é exatamente o que este trabalho existe para impedir.
     */
    await montar();
    expect(getCategoriasCursinho).toHaveBeenCalledWith("tok");
    expect(getCategorias).not.toHaveBeenCalled();
  });

  it("Gerenciar Categorias exige a permissão do cursinho", async () => {
    estado.permissao = {
      ...TODAS_AS_PERMISSOES,
      [Roles.alterarPermissao]: true,
      [Roles.gerenciarCategoriasCursinho]: false,
    };
    await montar();

    const botao = document.querySelector(
      '[data-action-id="gerenciar-categorias"]',
    ) as HTMLButtonElement;
    expect(botao).toBeDisabled();
  });
});
```

Acrescente `[Roles.gerenciarCategoriasCursinho]: true` a `TODAS_AS_PERMISSOES`.

⚠️ O mock de `getCategorias` já existe no arquivo; garanta que ele é um `vi.hoisted` acessível por
nome para o `not.toHaveBeenCalled()`. Se hoje for inline, promova-o.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/pages/partnerPrepProvas/index.test.tsx
```

Esperado: FAIL — `getCategoriasCursinho` não foi chamado.

- [ ] **Step 3: Implementar**

Em `src/pages/partnerPrepProvas/index.tsx`:

Troque o import e a chamada:

```tsx
import { getCategoriasCursinho } from "../../services/categoria/getCategoriasCursinho";
import { createCategoriaCursinho } from "../../services/categoria/createCategoriaCursinho";
import { deleteCategoriaCursinho } from "../../services/categoria/deleteCategoriaCursinho";
```

No `useEffect` de carga inicial, troque `getCategorias(token)` por `getCategoriasCursinho(token)`.

Passe os serviços ao modal:

```tsx
  const ModalManageCategorias = () => {
    return !modals.modalManageCategorias.isOpen ? null : (
      <ManageCategorias
        isOpen={modals.modalManageCategorias.isOpen}
        handleClose={() => modals.modalManageCategorias.close()}
        onCategoriasChanged={(cats) => setCategorias(cats)}
        listarService={getCategoriasCursinho}
        criarService={createCategoriaCursinho}
        excluirService={deleteCategoriaCursinho}
        nomeLivre
      />
    );
  };
```

⚠️ São referências de módulo, com identidade estável — **não** funções inline, que fariam o
`useEffect` do modal virar laço.

Troque a permissão da ação e o motivo:

```tsx
const MOTIVO = {
  cadastrarProvasCursinho: "Requer permissão: cadastrar provas do cursinho",
  visualizarEstudantes: "Requer permissão: visualizar estudantes",
  gerenciarCategoriasCursinho: "Requer permissão: gerenciar categorias do cursinho",
} as const;
```

```tsx
    /*
      ⚠️ Deixou de ser o botão permanentemente inerte que a migração da tela
      trouxe. Agora ele exige `gerenciarCategoriasCursinho` — permissão do
      cursinho, e não a `alterarPermissao` da administração de papéis, que
      nenhum colaborador tem e que não tem relação com o que o botão faz.
    */
    acao(
      "gerenciar-categorias",
      "Gerenciar Categorias",
      permissao[Roles.gerenciarCategoriasCursinho],
      MOTIVO.gerenciarCategoriasCursinho,
      () => modals.modalManageCategorias.open(),
    ),
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/pages/partnerPrepProvas/index.test.tsx
```

Esperado: PASS, com os 15 que já existiam mais os 2 novos.

- [ ] **Step 5: Provar por mutação**

1. Voltar a chamar `getCategorias(token)` no `useEffect` → falha "nunca pela global".
2. Voltar a permissão para `Roles.alterarPermissao` → falha "exige a permissão do cursinho".

- [ ] **Step 6: Suíte completa e build**

```bash
yarn test
yarn build && git checkout -- tsconfig.app.tsbuildinfo
```

⚠️ `yarn test`, **não** `yarn test:ci` — só o primeiro roda os 22 de `DashToolbar.test.tsx`.

⚠️ Confira a **contagem** de testes, não só a ausência de `FAIL`. Arquivo corrompido produz
`Tests  no tests`, que parece falha de asserção e não é.

- [ ] **Step 7: Commit e PR**

```bash
git add src/pages/partnerPrepProvas/
git commit -m "feat(partnerPrepProvas): categorias escopadas ao cursinho

A tela passa a consultar a rota do cursinho, entao Enem Dia 1 e Enem Dia 2
da plataforma deixam de aparecer no modal de Nova Prova. Gerenciar
Categorias deixa de ser botao inerte e passa a exigir a permissao do
cursinho."
```

Abra o PR seguindo a skill `abrir-pr`, registrando: dependência dos PRs do ms e da api, a ordem de
deploy, e o gate visual não executado.

---

# Deploy

⚠️ **Lockstep, nesta ordem.** Fora dela a tela quebra.

1. **Migração 0003 no Mongo** — `MONGODB=... bash scripts/migrations/0003-categoria-dono/migrar.sh`
2. **ms-simulado**
3. **migration da api** — `npm run migration:run` (permissão nova)
4. **api-vcnafacul**
5. **client-vcnafacul**

⚠️ **A ordem 1 → 2 não é preferência, é requisito.** O `delete` compara `categoria.dono !== dono`
com igualdade estrita: uma categoria legada sem o campo tem `dono === undefined`, que não casa nem com
`'system'`. Subir o ms antes do backfill deixa **toda categoria existente indeletável por qualquer
um** — inclusive pelo admin — e o erro que aparece é um 403 "Categoria de outro dono", que não sugere
em nada que o problema é a migração faltando.

⚠️ Entre 1 e 2 o ms antigo continua rodando contra o índice novo. Isso é seguro: ele não escreve
`dono`, e os documentos existentes já têm `dono: "system"` do backfill.

⚠️ Entre 2 e 4 a api antiga chama `v1/categoria` sem `dono` — o ms devolve as do sistema, que é
exatamente o comportamento de hoje. Sem degradação.

# Depois do merge

- [ ] Conferir em homologação que `db.categorias.getIndexes()` não tem mais `nome_1`
- [ ] Ligar `gerenciar_categorias_cursinho` no papel dos coordenadores de cursinho
- [ ] Gate manual: criar categoria "Enem Dia 1" pelo cursinho A e confirmar que o admin continua
      recebendo 409 ao tentar criar a dele
- [ ] Gate manual: confirmar que uma prova criada pelo cursinho com essa categoria gera **1** simulado
