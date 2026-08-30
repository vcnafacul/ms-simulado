# Categoria: contagem de uso e bloqueio de delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar quantos simulados/provas usam cada categoria e bloquear a exclusão de categorias em uso — incluindo provas, que hoje não são checadas (só simulados são).

**Architecture:** `ms-simulado` (fonte de verdade) ganha contagem agregada de `Simulado`/`Prova` por categoria (uma query `$group` por coleção, não N+1) e estende o bloqueio 409 do `delete()` para considerar as duas entidades. `api-vcnafacul` (proxy puro) e `client-vcnafacul` propagam os dois novos campos (`simuladosCount`/`provasCount`) até a UI, que passa a exibir a contagem no card e desabilitar o botão de excluir preventivamente, mantendo o 409 do servidor como validação real.

**Tech Stack:** NestJS 10/11, Mongoose (aggregation framework), Jest, React 19 + TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-29-categoria-uso-count-delete-block-design.md` (commit `50c0a8c`)

---

## Nota sobre a estratégia de agregação

O spec definia "aggregation pipeline ($lookup)" rodando dentro de `CategoriaRepository.getAll`/`getById`. Na investigação de código para este plano, optei por uma variante mais segura e de menor risco que preserva a mesma propriedade de performance (1 round-trip por coleção, não N+1 por categoria): em vez de `$lookup` embutido na query de Categoria (o que exigiria reescrever `getAll`/`getById`, perder o `.populate('exame')` atual e adivinhar nomes de coleção do Mongoose), cada contagem é obtida via `$group` direto nas próprias coleções `simulado`/`prova` (`CategoriaService` chama `SimuladoRepository.countsByCategoria(ids)` e `ProvaRepository.countsByCategoria(ids)` em paralelo com os ids das categorias já carregadas, e anexa os totais). `CategoriaRepository.getAll`/`getById` **não são alterados** — o que reduz o raio de mudança e preserva os testes já existentes desses métodos.

---

### Task 1: `ProvaRepository.countByCategoria` (contagem única, para o bloqueio de delete)

**Files:**
- Modify: `src/modules/prova/prova.repository.ts`
- Test: `src/modules/prova/prova.repository.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/modules/prova/prova.repository.spec.ts`:

```ts
describe('ProvaRepository.countByCategoria', () => {
  it('conta provas que referenciam a categoria', async () => {
    const countDocuments = jest.fn().mockResolvedValue(4);
    const repo = new ProvaRepository({ countDocuments } as any);

    const total = await repo.countByCategoria('cat-123');

    expect(total).toBe(4);
    expect(countDocuments).toHaveBeenCalledWith({ categoria: 'cat-123' });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/modules/prova/prova.repository.spec.ts --detectOpenHandles --forceExit`
Expected: FAIL com `repo.countByCategoria is not a function`

- [ ] **Step 3: Implementar**

Em `src/modules/prova/prova.repository.ts`, adicionar o método na classe `ProvaRepository` (logo após o construtor):

```ts
  async countByCategoria(categoriaId: string): Promise<number> {
    return this.model.countDocuments({ categoria: categoriaId });
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/modules/prova/prova.repository.spec.ts --detectOpenHandles --forceExit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/prova/prova.repository.ts src/modules/prova/prova.repository.spec.ts
git commit -m "feat(prova): add countByCategoria to ProvaRepository"
```

---

### Task 2: `ProvaRepository.countsByCategoria` (contagem em lote, para a listagem)

**Files:**
- Modify: `src/modules/prova/prova.repository.ts`
- Test: `src/modules/prova/prova.repository.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/modules/prova/prova.repository.spec.ts`:

```ts
describe('ProvaRepository.countsByCategoria', () => {
  it('agrupa a contagem de provas por categoria em um único aggregate', async () => {
    const catA = new Types.ObjectId();
    const catB = new Types.ObjectId();
    const aggregate = jest.fn().mockResolvedValue([
      { _id: catA, total: 2 },
      { _id: catB, total: 5 },
    ]);
    const repo = new ProvaRepository({ aggregate } as any);

    const counts = await repo.countsByCategoria([
      catA.toString(),
      catB.toString(),
    ]);

    expect(counts).toEqual({
      [catA.toString()]: 2,
      [catB.toString()]: 5,
    });
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { categoria: { $in: [catA, catB] } } },
      { $group: { _id: '$categoria', total: { $sum: 1 } } },
    ]);
  });

  it('retorna objeto vazio quando não há ids', async () => {
    const aggregate = jest.fn().mockResolvedValue([]);
    const repo = new ProvaRepository({ aggregate } as any);

    const counts = await repo.countsByCategoria([]);

    expect(counts).toEqual({});
  });
});
```

`Types` já não está importado neste arquivo de teste — adicionar no topo de `src/modules/prova/prova.repository.spec.ts`:

```ts
import { Types } from 'mongoose';
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/modules/prova/prova.repository.spec.ts --detectOpenHandles --forceExit`
Expected: FAIL com `repo.countsByCategoria is not a function`

- [ ] **Step 3: Implementar**

Em `src/modules/prova/prova.repository.ts`, trocar o import do topo:

```ts
import { ClientSession, Model } from 'mongoose';
```

por:

```ts
import { ClientSession, Model, Types } from 'mongoose';
```

E adicionar o método na classe `ProvaRepository`, logo abaixo de `countByCategoria`:

```ts
  async countsByCategoria(categoriaIds: string[]): Promise<Record<string, number>> {
    const rows = await this.model.aggregate([
      { $match: { categoria: { $in: categoriaIds.map((id) => new Types.ObjectId(id)) } } },
      { $group: { _id: '$categoria', total: { $sum: 1 } } },
    ]);
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row._id.toString()] = row.total;
      return acc;
    }, {});
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/modules/prova/prova.repository.spec.ts --detectOpenHandles --forceExit`
Expected: PASS (4 testes no describe `ProvaRepository.countsByCategoria`/`countByCategoria` juntos, todos verdes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/prova/prova.repository.ts src/modules/prova/prova.repository.spec.ts
git commit -m "feat(prova): add countsByCategoria batch aggregation to ProvaRepository"
```

---

### Task 3: `SimuladoRepository.countsByCategoria` (contagem em lote, para a listagem)

**Files:**
- Modify: `src/modules/simulado/simulado.repository.ts`
- Test: `src/modules/simulado/simulado.repository.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/modules/simulado/simulado.repository.spec.ts`:

```ts
describe('SimuladoRepository.countsByCategoria', () => {
  it('agrupa a contagem de simulados não-deletados por categoria em um único aggregate', async () => {
    const catA = new Types.ObjectId();
    const catB = new Types.ObjectId();
    const aggregate = jest.fn().mockResolvedValue([
      { _id: catA, total: 1 },
      { _id: catB, total: 3 },
    ]);
    const repo = new SimuladoRepository({ aggregate } as any);

    const counts = await repo.countsByCategoria([
      catA.toString(),
      catB.toString(),
    ]);

    expect(counts).toEqual({
      [catA.toString()]: 1,
      [catB.toString()]: 3,
    });
    expect(aggregate).toHaveBeenCalledWith([
      {
        $match: {
          categoria: { $in: [catA, catB] },
          deleted: { $ne: true },
        },
      },
      { $group: { _id: '$categoria', total: { $sum: 1 } } },
    ]);
  });

  it('retorna objeto vazio quando não há ids', async () => {
    const aggregate = jest.fn().mockResolvedValue([]);
    const repo = new SimuladoRepository({ aggregate } as any);

    const counts = await repo.countsByCategoria([]);

    expect(counts).toEqual({});
  });
});
```

Adicionar no topo de `src/modules/simulado/simulado.repository.spec.ts`:

```ts
import { Types } from 'mongoose';
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/modules/simulado/simulado.repository.spec.ts --detectOpenHandles --forceExit`
Expected: FAIL com `repo.countsByCategoria is not a function`

- [ ] **Step 3: Implementar**

Em `src/modules/simulado/simulado.repository.ts`, trocar o import do topo:

```ts
import { ClientSession, Model } from 'mongoose';
```

por:

```ts
import { ClientSession, Model, Types } from 'mongoose';
```

E adicionar o método na classe `SimuladoRepository`, logo abaixo de `countByCategoria`:

```ts
  async countsByCategoria(categoriaIds: string[]): Promise<Record<string, number>> {
    const rows = await this.model.aggregate([
      {
        $match: {
          categoria: { $in: categoriaIds.map((id) => new Types.ObjectId(id)) },
          deleted: { $ne: true },
        },
      },
      { $group: { _id: '$categoria', total: { $sum: 1 } } },
    ]);
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row._id.toString()] = row.total;
      return acc;
    }, {});
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/modules/simulado/simulado.repository.spec.ts --detectOpenHandles --forceExit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/simulado/simulado.repository.ts src/modules/simulado/simulado.repository.spec.ts
git commit -m "feat(simulado): add countsByCategoria batch aggregation to SimuladoRepository"
```

---

### Task 4: `CategoriaOutputDTO` (novo shape de saída com as contagens)

**Files:**
- Create: `src/modules/categoria/dtos/categoria-output.dto.ts`

Sem teste — é uma classe de dados/Swagger, sem lógica.

- [ ] **Step 1: Criar o DTO**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Categoria } from '../schemas/categoria.schema';

export class CategoriaOutputDTO extends Categoria {
  @ApiProperty()
  public simuladosCount: number;

  @ApiProperty()
  public provasCount: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/categoria/dtos/categoria-output.dto.ts
git commit -m "feat(categoria): add CategoriaOutputDTO with usage counts"
```

---

### Task 5: `CategoriaModule` — importar `ProvaModule`

**Files:**
- Modify: `src/modules/categoria/categoria.module.ts`

Sem teste unitário — é wiring de DI. Verificado no boot do app na Task 13.

- [ ] **Step 1: Adicionar o import e a entrada em `imports`**

Em `src/modules/categoria/categoria.module.ts`, adicionar ao bloco de imports do topo:

```ts
import { ProvaModule } from '../prova/prova.module';
```

E no array `imports` do `@Module`, adicionar `forwardRef(() => ProvaModule)` ao lado do `forwardRef(() => SimuladoModule)` já existente:

```ts
  imports: [
    forwardRef(() => SimuladoModule),
    forwardRef(() => ProvaModule),
    MongooseModule.forFeature([
      { name: Categoria.name, schema: CategoriaSchema },
    ]),
    FrenteModule,
    MateriaModule,
    ExameModule,
  ],
```

`forwardRef` é necessário (não um import direto) porque `ProvaModule` importa `SimuladoModule`, que por sua vez importa `forwardRef(() => CategoriaModule)` — adicionar `CategoriaModule -> ProvaModule` fecha um ciclo de 3 módulos (`Categoria -> Prova -> Simulado -> Categoria`), e o padrão já usado neste arquivo para o par Categoria/Simulado é `forwardRef` nos dois lados.

- [ ] **Step 2: Commit**

```bash
git add src/modules/categoria/categoria.module.ts
git commit -m "feat(categoria): import ProvaModule to access ProvaRepository"
```

---

### Task 6: `CategoriaService.delete` — bloquear também quando há provas vinculadas

**Files:**
- Modify: `src/modules/categoria/categoria.service.ts`
- Test: `src/modules/categoria/categoria.service.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Substituir o conteúdo de `src/modules/categoria/categoria.service.spec.ts` por:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriaService } from './categoria.service';

function makeService(overrides?: {
  getById?: jest.Mock;
  deleteFn?: jest.Mock;
  countByCategoriaSimulado?: jest.Mock;
  countByCategoriaProva?: jest.Mock;
}) {
  const repository = {
    getById: overrides?.getById ?? jest.fn().mockResolvedValue({ _id: 'cat-1' }),
    delete: overrides?.deleteFn ?? jest.fn().mockResolvedValue(undefined),
  };
  const simuladoRepository = {
    countByCategoria: overrides?.countByCategoriaSimulado ?? jest.fn().mockResolvedValue(0),
    countsByCategoria: jest.fn().mockResolvedValue({}),
  };
  const provaRepository = {
    countByCategoria: overrides?.countByCategoriaProva ?? jest.fn().mockResolvedValue(0),
    countsByCategoria: jest.fn().mockResolvedValue({}),
  };
  const service = new CategoriaService(
    repository as any,
    simuladoRepository as any,
    provaRepository as any,
  );
  return { service, repository, simuladoRepository, provaRepository };
}

describe('CategoriaService.delete', () => {
  it('deleta quando nenhum simulado ou prova usa a categoria', async () => {
    const { service, repository, simuladoRepository, provaRepository } = makeService();

    await service.delete('cat-1');

    expect(simuladoRepository.countByCategoria).toHaveBeenCalledWith('cat-1');
    expect(provaRepository.countByCategoria).toHaveBeenCalledWith('cat-1');
    expect(repository.delete).toHaveBeenCalledWith('cat-1');
  });

  it('lança 409 quando há simulados vinculados', async () => {
    const { service, repository } = makeService({
      countByCategoriaSimulado: jest.fn().mockResolvedValue(3),
    });

    await expect(service.delete('cat-1')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('lança 409 quando há provas vinculadas, mesmo com zero simulados', async () => {
    const { service, repository } = makeService({
      countByCategoriaProva: jest.fn().mockResolvedValue(5),
    });

    await expect(service.delete('cat-1')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('inclui simuladosUsando e provasUsando no payload do 409', async () => {
    const { service } = makeService({
      countByCategoriaSimulado: jest.fn().mockResolvedValue(2),
      countByCategoriaProva: jest.fn().mockResolvedValue(7),
    });

    const error = await service.delete('cat-1').catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message: 'Categoria em uso e não pode ser excluída',
      simuladosUsando: 2,
      provasUsando: 7,
    });
  });

  it('lança 404 quando a categoria não existe', async () => {
    const { service, simuladoRepository, provaRepository } = makeService({
      getById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.delete('cat-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(simuladoRepository.countByCategoria).not.toHaveBeenCalled();
    expect(provaRepository.countByCategoria).not.toHaveBeenCalled();
  });
});

describe('CategoriaService.add', () => {
  function makeAddService(over?: {
    getByFilter?: jest.Mock;
    create?: jest.Mock;
  }) {
    const repository = {
      getByFilter: over?.getByFilter ?? jest.fn().mockResolvedValue(null),
      create: over?.create ?? jest.fn().mockImplementation(async (c) => c),
    };
    const simuladoRepository = { countByCategoria: jest.fn(), countsByCategoria: jest.fn() };
    const provaRepository = { countByCategoria: jest.fn(), countsByCategoria: jest.fn() };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );
    return { service, repository };
  }

  it('auto-gera nome e força custom/selecionavel', async () => {
    const { service, repository } = makeAddService();
    await service.add({ exame: 'e1', quantidadeTotalQuestao: 30, duracao: 60 } as any);
    const saved = repository.create.mock.calls[0][0];
    expect(saved.nome).toBe('Personalizado 30q 60min');
    expect(saved.custom).toBe(true);
    expect(saved.selecionavel).toBe(true);
    expect(repository.getByFilter).toHaveBeenCalledWith({
      nome: 'Personalizado 30q 60min',
    });
  });

  it('auto-gera nome com prefixo fornecido', async () => {
    const { service, repository } = makeAddService();
    await service.add({ exame: 'e1', prefixo: 'Mini Sabatina', quantidadeTotalQuestao: 20, duracao: 45 } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe('Mini Sabatina 20q 45min');
  });

  it('normaliza espaços internos do prefixo (nome tem índice unique)', async () => {
    const { service, repository } = makeAddService();
    await service.add({ exame: 'e1', prefixo: 'Mini   Sabatina', quantidadeTotalQuestao: 20, duracao: 45 } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe('Mini Sabatina 20q 45min');
  });

  it('gera "livre" quando quantidadeTotalQuestao é null', async () => {
    const { service, repository } = makeAddService();
    await service.add({ exame: 'e1', quantidadeTotalQuestao: null, duracao: 60 } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe('Personalizado livre 60min');
  });

  it('usa o nome explícito quando fornecido e válido', async () => {
    const { service, repository } = makeAddService();
    await service.add({ nome: 'Custom 10q 30min', exame: 'e1', duracao: 30 } as any);
    expect(repository.create.mock.calls[0][0].nome).toBe('Custom 10q 30min');
  });

  it('lança 409 quando o nome já existe (colisão antes do pattern)', async () => {
    const { service } = makeAddService({ getByFilter: jest.fn().mockResolvedValue({ _id: 'seed-enem' }) });
    await expect(
      service.add({ nome: 'Enem Dia 1', exame: 'e1', duracao: 60 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lança 400 quando o nome novo não segue o pattern', async () => {
    const { service } = makeAddService();
    await expect(
      service.add({ nome: 'Nome mal formatado', exame: 'e1', duracao: 60 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('força custom:true e selecionavel:true mesmo se o DTO enviar false', async () => {
    const { service, repository } = makeAddService();
    await service.add({ nome: 'Custom 10q 30min', exame: 'e1', duracao: 30, custom: false, selecionavel: false } as any);
    const saved = repository.create.mock.calls[0][0];
    expect(saved.custom).toBe(true);
    expect(saved.selecionavel).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/modules/categoria/categoria.service.spec.ts --detectOpenHandles --forceExit`
Expected: FAIL — `CategoriaService` só aceita 2 argumentos no construtor hoje (erro de tipo/runtime ao passar 3), e os testes de "provas vinculadas" falham porque `delete()` ainda não considera `provaRepository`.

- [ ] **Step 3: Implementar**

Em `src/modules/categoria/categoria.service.ts`, trocar os imports do topo:

```ts
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { Categoria } from './schemas/categoria.schema';
import { CategoriaRepository } from './categoria.repository';
```

por:

```ts
import { SimuladoRepository } from '../simulado/simulado.repository';
import { ProvaRepository } from '../prova/prova.repository';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { Categoria } from './schemas/categoria.schema';
import { CategoriaRepository } from './categoria.repository';
```

Trocar o construtor:

```ts
  constructor(
    private readonly repository: CategoriaRepository,
    @Inject(forwardRef(() => SimuladoRepository))
    private readonly simuladoRepository: SimuladoRepository,
  ) {}
```

por:

```ts
  constructor(
    private readonly repository: CategoriaRepository,
    @Inject(forwardRef(() => SimuladoRepository))
    private readonly simuladoRepository: SimuladoRepository,
    @Inject(forwardRef(() => ProvaRepository))
    private readonly provaRepository: ProvaRepository,
  ) {}
```

Trocar o método `delete`:

```ts
  public async delete(id: string): Promise<void> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }

    const simuladosUsando = await this.simuladoRepository.countByCategoria(id);
    if (simuladosUsando > 0) {
      throw new ConflictException({
        message: 'Categoria em uso e não pode ser excluída',
        simuladosUsando,
      });
    }

    await this.repository.delete(id);
  }
```

por:

```ts
  public async delete(id: string): Promise<void> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest src/modules/categoria/categoria.service.spec.ts --detectOpenHandles --forceExit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/categoria/categoria.service.ts src/modules/categoria/categoria.service.spec.ts
git commit -m "fix(categoria): block delete when category has provas linked, not just simulados"
```

---

### Task 7: `CategoriaService.getAll`/`getById` — anexar `simuladosCount`/`provasCount`

**Files:**
- Modify: `src/modules/categoria/categoria.service.ts`
- Test: `src/modules/categoria/categoria.service.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/modules/categoria/categoria.service.spec.ts`:

```ts
describe('CategoriaService.getAll (anexa contagem de uso)', () => {
  it('anexa simuladosCount e provasCount a cada categoria retornada', async () => {
    const repository = {
      getAll: jest.fn().mockResolvedValue({
        data: [
          { _id: 'cat-1', nome: 'A' },
          { _id: 'cat-2', nome: 'B' },
        ],
        page: 1,
        limit: 10,
        totalItems: 2,
      }),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-1': 3 }),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-2': 5 }),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getAll({ page: 1, limit: 10 });

    expect(result.data).toEqual([
      { _id: 'cat-1', nome: 'A', simuladosCount: 3, provasCount: 0 },
      { _id: 'cat-2', nome: 'B', simuladosCount: 0, provasCount: 5 },
    ]);
    expect(simuladoRepository.countsByCategoria).toHaveBeenCalledWith(['cat-1', 'cat-2']);
    expect(provaRepository.countsByCategoria).toHaveBeenCalledWith(['cat-1', 'cat-2']);
  });

  it('converte documento Mongoose (com toObject) antes de anexar as contagens', async () => {
    const doc = {
      _id: 'cat-1',
      toObject: jest.fn().mockReturnValue({ _id: 'cat-1', nome: 'A' }),
    };
    const repository = {
      getAll: jest.fn().mockResolvedValue({
        data: [doc],
        page: 1,
        limit: 10,
        totalItems: 1,
      }),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({}),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({}),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getAll({ page: 1, limit: 10 });

    expect(doc.toObject).toHaveBeenCalled();
    expect(result.data).toEqual([
      { _id: 'cat-1', nome: 'A', simuladosCount: 0, provasCount: 0 },
    ]);
  });
});

describe('CategoriaService.getById (anexa contagem de uso)', () => {
  it('retorna a categoria com simuladosCount/provasCount', async () => {
    const repository = {
      getById: jest.fn().mockResolvedValue({ _id: 'cat-1', nome: 'A' }),
    };
    const simuladoRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-1': 4 }),
    };
    const provaRepository = {
      countByCategoria: jest.fn(),
      countsByCategoria: jest.fn().mockResolvedValue({ 'cat-1': 2 }),
    };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getById('cat-1');

    expect(result).toEqual({ _id: 'cat-1', nome: 'A', simuladosCount: 4, provasCount: 2 });
  });

  it('retorna null quando a categoria não existe', async () => {
    const repository = { getById: jest.fn().mockResolvedValue(null) };
    const simuladoRepository = { countByCategoria: jest.fn(), countsByCategoria: jest.fn() };
    const provaRepository = { countByCategoria: jest.fn(), countsByCategoria: jest.fn() };
    const service = new CategoriaService(
      repository as any,
      simuladoRepository as any,
      provaRepository as any,
    );

    const result = await service.getById('cat-x');

    expect(result).toBeNull();
    expect(simuladoRepository.countsByCategoria).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/modules/categoria/categoria.service.spec.ts --detectOpenHandles --forceExit`
Expected: FAIL — `getAll`/`getById` ainda retornam a categoria sem `simuladosCount`/`provasCount`.

- [ ] **Step 3: Implementar**

Em `src/modules/categoria/categoria.service.ts`, adicionar o import do DTO (junto aos outros imports do topo):

```ts
import { CategoriaOutputDTO } from './dtos/categoria-output.dto';
```

Trocar `getById` e `getAll`:

```ts
  public async getById(id: string): Promise<Categoria> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Categoria>> {
    return await this.repository.getAll(param);
  }
```

por:

```ts
  public async getById(id: string): Promise<CategoriaOutputDTO | null> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      return null;
    }
    const [comUso] = await this.attachUsageCounts([categoria]);
    return comUso;
  }

  public async getAll(
    param: GetAllInput,
  ): Promise<GetAllOutput<CategoriaOutputDTO>> {
    const result = await this.repository.getAll(param);
    return {
      ...result,
      data: await this.attachUsageCounts(result.data),
    };
  }
```

E adicionar o método privado no final da classe, depois de `delete`:

```ts
  private async attachUsageCounts(
    categorias: Categoria[],
  ): Promise<CategoriaOutputDTO[]> {
    const ids = categorias.map((c) => c._id.toString());
    const [simuladoCounts, provaCounts] = await Promise.all([
      this.simuladoRepository.countsByCategoria(ids),
      this.provaRepository.countsByCategoria(ids),
    ]);
    return categorias.map((categoria) => {
      const plain = typeof (categoria as any).toObject === 'function'
        ? (categoria as any).toObject()
        : categoria;
      const id = plain._id.toString();
      return {
        ...plain,
        simuladosCount: simuladoCounts[id] ?? 0,
        provasCount: provaCounts[id] ?? 0,
      } as CategoriaOutputDTO;
    });
  }
```

Nota: a conversão via `toObject()` é necessária porque documentos Mongoose serializam via seus paths de schema (`toJSON`/`toObject` automáticos do Express/Nest na resposta HTTP) e descartariam `simuladosCount`/`provasCount` por não fazerem parte do schema — por isso viram objeto plano *antes* de anexar os campos computados.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest src/modules/categoria/categoria.service.spec.ts --detectOpenHandles --forceExit`
Expected: PASS (todos os describes: `delete`, `add`, `getAll`, `getById`)

- [ ] **Step 5: Commit**

```bash
git add src/modules/categoria/categoria.service.ts src/modules/categoria/categoria.service.spec.ts
git commit -m "feat(categoria): attach simuladosCount/provasCount to getAll/getById"
```

---

### Task 8: `CategoriaController` — expor `CategoriaOutputDTO` no Swagger

**Files:**
- Modify: `src/modules/categoria/categoria.controller.ts`

Sem teste — é só anotação de tipo/Swagger, sem lógica nova (o controller já repassa o retorno do service).

- [ ] **Step 1: Atualizar imports e tipos**

Em `src/modules/categoria/categoria.controller.ts`, trocar o import:

```ts
import { Categoria } from './schemas/categoria.schema';
```

por:

```ts
import { Categoria } from './schemas/categoria.schema';
import { CategoriaOutputDTO } from './dtos/categoria-output.dto';
```

Trocar o método `getAll`:

```ts
  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: Categoria,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Categoria>> {
    return await this.service.getAll(query);
  }
```

por:

```ts
  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: CategoriaOutputDTO,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<CategoriaOutputDTO>> {
    return await this.service.getAll(query);
  }
```

Trocar o método `getById`:

```ts
  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: Categoria,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Categoria> {
    return await this.service.getById(id);
  }
```

por:

```ts
  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: CategoriaOutputDTO,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<CategoriaOutputDTO | null> {
    return await this.service.getById(id);
  }
```

- [ ] **Step 2: Rodar a suíte do módulo para garantir que nada quebrou**

Run: `npx jest src/modules/categoria --detectOpenHandles --forceExit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/categoria/categoria.controller.ts
git commit -m "feat(categoria): expose usage counts in controller Swagger docs"
```

---

### Task 9: `api-vcnafacul` — propagar `simuladosCount`/`provasCount` no proxy

**Files:**
- Modify: `api-vcnafacul/src/modules/simulado/dtos/categoria.dto.output.ts`

Sem teste — `CategoriaProxyService` já repassa o corpo da resposta do `ms-simulado` sem transformação (confirmado em `categoria.service.spec.ts` do proxy, que testa apenas os parâmetros da chamada HTTP, não o formato do corpo). Esta mudança é só a documentação Swagger do proxy.

- [ ] **Step 1: Adicionar os campos ao DTO**

Em `api-vcnafacul/src/modules/simulado/dtos/categoria.dto.output.ts`, adicionar ao final da classe `CategoriaDTO` (antes do `}` de fechamento):

```ts
  @ApiProperty()
  public simuladosCount: number;

  @ApiProperty()
  public provasCount: number;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-1/api-vcnafacul
git add src/modules/simulado/dtos/categoria.dto.output.ts
git commit -m "feat(categoria): expose simuladosCount/provasCount in proxy DTO"
```

---

### Task 10: `client-vcnafacul` — adicionar os campos em `ICategoria`

**Files:**
- Modify: `client-vcnafacul/src/dtos/categoria/categoria.ts`

Sem teste — não há suíte de testes automatizados no `client-vcnafacul` (confirmado: nenhum script `test` no `package.json` e nenhum arquivo `*.test.*`/`*.spec.*` no projeto). Verificação é manual, na Task 13.

- [ ] **Step 1: Atualizar a interface**

Em `client-vcnafacul/src/dtos/categoria/categoria.ts`, trocar:

```ts
export interface ICategoria {
  _id: string;
  nome: string;
  duracao: number;
  quantidadeTotalQuestao: number | null;
  exame: IExameRef;
  custom: boolean;
  selecionavel: boolean;
  descricao: string;
}
```

por:

```ts
export interface ICategoria {
  _id: string;
  nome: string;
  duracao: number;
  quantidadeTotalQuestao: number | null;
  exame: IExameRef;
  custom: boolean;
  selecionavel: boolean;
  descricao: string;
  simuladosCount: number;
  provasCount: number;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-1/client-vcnafacul
git add src/dtos/categoria/categoria.ts
git commit -m "feat(categoria): add simuladosCount/provasCount to ICategoria"
```

---

### Task 11: `client-vcnafacul` — exibir a contagem e desabilitar o botão de excluir

**Files:**
- Modify: `client-vcnafacul/src/pages/dashProvas/modals/manageCategorias/index.tsx:119-159`

- [ ] **Step 1: Implementar**

Em `client-vcnafacul/src/pages/dashProvas/modals/manageCategorias/index.tsx`, trocar o bloco `.map` (linhas 119-159):

```tsx
            {categoriasFiltradas.map((c) => {
              const protegida = isProtegida(c.nome);
              const qtd =
                c.quantidadeTotalQuestao == null
                  ? "livre"
                  : `${c.quantidadeTotalQuestao} questões`;
              return (
                <div
                  key={c._id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-900">
                      {c.nome}
                    </span>
                    <span className="text-sm text-gray-500">
                      Exame: {c.exame?.nome ?? "—"} · {qtd} · {c.duracao} min ·{" "}
                      {c.selecionavel ? "Selecionável" : "Uso interno"}
                    </span>
                    {protegida && (
                      <span className="text-xs font-medium text-amber-600">
                        🔒 Categoria seedada
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={protegida}
                    title={
                      protegida
                        ? "Categoria seedada — não pode ser excluída"
                        : "Excluir categoria"
                    }
                    onClick={() => abrirExcluir(c)}
                    className="text-gray-400 enabled:hover:text-red disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
```

por:

```tsx
            {categoriasFiltradas.map((c) => {
              const protegida = isProtegida(c.nome);
              const qtd =
                c.quantidadeTotalQuestao == null
                  ? "livre"
                  : `${c.quantidadeTotalQuestao} questões`;
              const emUso = c.simuladosCount > 0 || c.provasCount > 0;
              const desabilitada = protegida || emUso;
              const tooltip = protegida
                ? "Categoria seedada — não pode ser excluída"
                : emUso
                  ? `Em uso por ${c.simuladosCount} simulado(s) e ${c.provasCount} prova(s)`
                  : "Excluir categoria";
              return (
                <div
                  key={c._id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-gray-900">
                      {c.nome}
                    </span>
                    <span className="text-sm text-gray-500">
                      Exame: {c.exame?.nome ?? "—"} · {qtd} · {c.duracao} min ·{" "}
                      {c.selecionavel ? "Selecionável" : "Uso interno"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {emUso
                        ? `${c.simuladosCount} simulados · ${c.provasCount} provas em uso`
                        : "Sem simulados/provas em uso"}
                    </span>
                    {protegida && (
                      <span className="text-xs font-medium text-amber-600">
                        🔒 Categoria seedada
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={desabilitada}
                    title={tooltip}
                    onClick={() => abrirExcluir(c)}
                    className="text-gray-400 enabled:hover:text-red disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
```

- [ ] **Step 2: Verificar manualmente**

Rodar `npm run dev` no `client-vcnafacul` (com `api-vcnafacul` e `ms-simulado` também no ar), abrir a `DashProva`, clicar em "Gerenciar Categorias" e confirmar:
- Categorias com simulados/provas vinculados mostram "N simulados · M provas em uso" e o botão de lixeira está desabilitado com tooltip ao passar o mouse.
- Categorias sem uso mostram "Sem simulados/provas em uso" e o botão está habilitado.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashProvas/modals/manageCategorias/index.tsx
git commit -m "feat(categoria): show usage count and disable delete button when in use"
```

---

### Task 12: `client-vcnafacul` — mensagem do 409 com simulados e provas

**Files:**
- Modify: `client-vcnafacul/src/services/categoria/deleteCategoria.ts`

- [ ] **Step 1: Implementar**

Em `client-vcnafacul/src/services/categoria/deleteCategoria.ts`, trocar:

```ts
  if (response.status === 409) {
    const err = await response.json();
    const detalhes =
      err.simuladosUsando != null
        ? `${err.simuladosUsando} simulados usam essa categoria`
        : err.message;
    throw new Error(`Categoria em uso — ${detalhes}`);
  }
```

por:

```ts
  if (response.status === 409) {
    const err = await response.json();
    const partes: string[] = [];
    if (err.simuladosUsando > 0) partes.push(`${err.simuladosUsando} simulados`);
    if (err.provasUsando > 0) partes.push(`${err.provasUsando} provas`);
    const detalhes =
      partes.length > 0 ? `${partes.join(" e ")} usam essa categoria` : err.message;
    throw new Error(`Categoria em uso — ${detalhes}`);
  }
```

- [ ] **Step 2: Verificar manualmente**

Com o backend rodando, tentar excluir (via chamada direta à API, já que o botão fica desabilitado na UI para categorias em uso — ex.: `curl -X DELETE` autenticado numa categoria com provas vinculadas) e confirmar que a resposta 409 tem `simuladosUsando`/`provasUsando`, e que se essa chamada fosse feita pela UI o toast mostraria a mensagem combinada.

- [ ] **Step 3: Commit**

```bash
git add src/services/categoria/deleteCategoria.ts
git commit -m "fix(categoria): include provasUsando in the 409 error message"
```

---

### Task 13: Verificação final — testes, lint, build e smoke test end-to-end

**Files:** nenhum (só comandos)

- [ ] **Step 1: Suíte completa do `ms-simulado`**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-1/ms-simulado
npm run test
npm run lint
npm run build
```

Expected: todos os três passam sem erro.

- [ ] **Step 2: Boot do `ms-simulado` — confirma que o wiring de módulos da Task 5 não criou dependência circular não resolvida**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-1/ms-simulado
npm run dev
```

Expected: app sobe sem erro `Nest can't resolve dependencies` / `circular dependency`. Parar o processo depois de confirmar (Ctrl+C).

- [ ] **Step 3: Suíte completa do `api-vcnafacul`**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-1/api-vcnafacul
npm run lint
npm run build
```

Expected: ambos passam sem erro. (`npm run test` do api-vcnafacul sobe Docker MySQL + e2e; rodar só se o ambiente Docker estiver disponível — os testes existentes de `categoria.service.spec.ts` do proxy não foram alterados nesta mudança.)

- [ ] **Step 4: Lint e build do `client-vcnafacul`**

```bash
cd /Users/fernandoalmeidapinto/Projects/vcnafacul/vcnafacul-1/client-vcnafacul
npm run lint
npm run build
```

Expected: ambos passam sem erro (lint zero warnings).

- [ ] **Step 5: Smoke test manual end-to-end**

Com os três serviços no ar (`ms-simulado`, `api-vcnafacul`, `client-vcnafacul`):
1. Abrir o modal "Gerenciar Categorias" na `DashProva`.
2. Confirmar que uma categoria seedada com simulados/provas de fato vinculados (ex.: "Enem Dia 1", se o ambiente local tiver dados) mostra a contagem correta e o botão de excluir desabilitado.
3. Criar uma categoria nova (sem uso) via "+ Nova Categoria", confirmar que aparece com "Sem simulados/provas em uso" e o botão habilitado.
4. Excluir essa categoria nova e confirmar sucesso (toast "Categoria excluída").
5. Tentar excluir (via chamada direta à API autenticada, contornando o botão desabilitado) uma categoria com provas vinculadas mas zero simulados, e confirmar que a API responde 409 com `provasUsando > 0` — esse é o cenário do bug original reportado pelo Cleyton.

- [ ] **Step 6: Commit final (se houver ajustes pendentes de lint/build)**

```bash
# Só se algum dos comandos acima tiver exigido correção
git add -A
git commit -m "chore(categoria): fix lint/build issues found in final verification"
```
