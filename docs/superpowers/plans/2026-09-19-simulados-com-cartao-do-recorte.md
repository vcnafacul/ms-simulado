# Simulados com cartão do recorte — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma rota que responda "quais simulados têm cartão-resposta neste recorte (cursinho, ou turma), quantos, quantos já lidos, e quando entrou o mais recente" — a peça que faltou no contrato dos cards `02`/`04` e que bloqueia os dois cards de tela (`05` e `06`).

**Architecture:** Uma agregação nova na coleção de junção `RelatorioSimuladoEstudante` do `ms-simulado`, agrupando por `simulado`; o nome vem de uma segunda leitura e um `Map` no serviço, não de `$lookup`. Na `api-vcnafacul`, um proxy fino no módulo do card `04`, com `cursinhoId` do JWT. Nos dois repos a rota literal `simulados` precisa ser declarada **antes** de `:simuladoId`, e isso exige teste que suba o app.

**Tech Stack:** NestJS 10, Mongoose (ms), Axios (api), Jest, `mongodb-memory-server`, supertest.

**Spec:** `ms-simulado/docs/superpowers/specs/2026-09-19-simulados-com-cartao-do-recorte-design.md`

**Branches (já criadas):** `feature/04b-simulados-com-cartao` nos dois repos. A da api sai de `feature/04-orquestracao-do-relatorio` (PR #551), **não** da develop.

---

## Estrutura de arquivos

### ms-simulado

| arquivo | responsabilidade |
|---|---|
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.ts` | +1 índice `{cursinhoId, turmaId}` |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts` | +`listarSimuladosComCartao` (a agregação) |
| `src/modules/simulado/simulado.repository.ts` | +`getNomesPorIds` (leitura magra, como `getNumerosDasQuestoes`) |
| `src/modules/relatorio-simulado-estudante/dtos/simulados-com-cartao.dto.output.ts` | **novo** — o DTO de saída |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts` | +`listarSimulados` (junta agregado + nome) |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts` | +rota, **antes** de `:simuladoId` |

### api-vcnafacul

| arquivo | responsabilidade |
|---|---|
| `src/modules/simulado/relatorio/relatorio-http.service.ts` | +`buscarSimulados` |
| `src/modules/simulado/relatorio/dtos/simulados-com-cartao.dto.output.ts` | **novo** — espelha o DTO do ms |
| `src/modules/simulado/relatorio/relatorio.service.ts` | +`listarSimulados` (resolve cursinho do JWT, repassa) |
| `src/modules/simulado/relatorio/relatorio.controller.ts` | +rota, **antes** de `:simuladoId` |

---

## ⚠️ Comandos e regras da casa

- **ms-simulado:** `npx jest --detectOpenHandles --forceExit <caminho>` para um arquivo. **NUNCA** `yarn lint` — ele reformata o repositório inteiro; use `npx eslint <caminho>`.
- **api-vcnafacul:** `npx jest <caminho>`. **NUNCA** `npm test` — ele sobe Docker MySQL e roda a e2e inteira. Build: `npm run build`.
- Commitar **adicionando por nome**, nunca `git add .`.

---

## Task 1: O índice que a consulta nova precisa

Os dois índices da junção são `{simulado, cursinhoId}` e `{simulado, turmaId}` — **os dois prefixados por `simulado`**. A consulta nova filtra por `cursinhoId` e **não** por simulado, então nenhum serve: seria varredura de coleção. Um índice composto `{cursinhoId, turmaId}` serve aos dois recortes, porque o Mongo usa prefixo de índice composto.

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

O arquivo `relatorio-simulado-estudante.schema.spec.ts` já tem um helper `indices()` (linha ~25) e um
teste `'indexa os dois recortes do relatório'` que compara `JSON.stringify` das chaves. Acrescente
**logo depois dele**, no mesmo `describe`, usando o mesmo helper:

```ts
  it('indexa o recorte SEM simulado no prefixo — é o da lista de simulados', () => {
    // A consulta do card 04b agrupa POR simulado, filtrando só por `cursinhoId`
    // (e talvez `turmaId`). Os dois índices acima começam por `simulado`, e
    // prefixo de índice composto não serve a quem não filtra o prefixo: seria
    // varredura de coleção — invisível numa coleção nova e pequena, cara
    // depois.
    const chaves = indices().map((i) => JSON.stringify(i.campos));

    expect(chaves).toContain(JSON.stringify({ cursinhoId: 1, turmaId: 1 }));
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.spec.ts`
Expected: FAIL — `cursinhoId,turmaId` não está entre as chaves.

- [ ] **Step 3: Acrescentar o índice**

No fim de `relatorio-simulado-estudante.schema.ts`, depois dos índices existentes:

```ts
/**
 * O card 04b agrupa por simulado filtrando só por `cursinhoId` (e opcionalmente
 * `turmaId`). Os três índices acima começam por `simulado`, e prefixo de índice
 * composto não serve a quem não filtra o prefixo. Este serve aos DOIS recortes:
 * o Mongo usa `{cursinhoId}` sozinho como prefixo deste.
 */
RelatorioSimuladoEstudanteSchema.index({ cursinhoId: 1, turmaId: 1 });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.schema.spec.ts
git commit -m "feat: indice por cursinho e turma na juncao do relatorio"
```

---

## Task 2: A agregação, contra Mongo de verdade

⚠️ **Dublê não prova agregação.** Um mock de `.aggregate()` confirma que você montou um array de objetos, não que o Mongo devolve o que você espera. Os cards `02` e `03` estabeleceram o precedente: teste contra Mongo real, no `relatorio-simulado-estudante.isolamento.spec.ts`, **reusando a instância que o arquivo já sobe** (não crie um arquivo novo — outro `MongoMemoryServer` custa dezenas de segundos).

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`

- [ ] **Step 1: Ler o bloco vizinho** para copiar o padrão de seed e de acesso aos models

Run: `sed -n '200,260p' src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`

Você vai reusar `relModel`, `histModel` e `repo`, que já existem no escopo do `describe` externo.

- [ ] **Step 2: Escrever o teste que falha**

Acrescente um `describe` irmão **dentro** do `describe` externo (`'RelatorioSimuladoEstudante — isolamento (Mongo real em memória)'`), logo depois do bloco `'agregado por questão (Mongo real)'`:

```ts
  describe('listarSimuladosComCartao (Mongo real)', () => {
    const SIM_L1 = new Types.ObjectId();
    const SIM_L2 = new Types.ObjectId();
    const CUR = 'cur-lista';

    beforeAll(async () => {
      // SIM_L1: três estudantes. Um completo, um falho, e um cuja ref de
      // histórico vai ser apagada — os três ENVIARAM cartão.
      const hOk = await histModel.create({
        usuario: 'u-l1', simulado: SIM_L1, status: 'completed',
      });
      const hFalhou = await histModel.create({
        usuario: 'u-l2', simulado: SIM_L1, status: 'failed',
        falha: { codigo: 'cartao_nao_detectado' },
      });
      const hOrfao = await histModel.create({
        usuario: 'u-l3', simulado: SIM_L1, status: 'completed',
      });

      await relModel.create({
        historico: hOk._id, simulado: SIM_L1, usuario: 'u-l1',
        cursinhoId: CUR, turmaId: 't-A',
      });
      await relModel.create({
        historico: hFalhou._id, simulado: SIM_L1, usuario: 'u-l2',
        cursinhoId: CUR, turmaId: 't-B',
      });
      await relModel.create({
        historico: hOrfao._id, simulado: SIM_L1, usuario: 'u-l3',
        cursinhoId: CUR, turmaId: 't-A',
      });
      // a ref morre DEPOIS do vínculo — é o caso que o repositório já tipa
      // como `historico: Historico | null`
      await histModel.deleteOne({ _id: hOrfao._id });

      // SIM_L2: um estudante só, e mais recente que o SIM_L1
      const hOutro = await histModel.create({
        usuario: 'u-l4', simulado: SIM_L2, status: 'completed',
      });
      await relModel.create({
        historico: hOutro._id, simulado: SIM_L2, usuario: 'u-l4',
        cursinhoId: CUR, turmaId: 't-A',
      });

      // de OUTRO cursinho, no mesmo simulado — não pode aparecer
      const hAlheio = await histModel.create({
        usuario: 'u-alheio', simulado: SIM_L1, status: 'completed',
      });
      await relModel.create({
        historico: hAlheio._id, simulado: SIM_L1, usuario: 'u-alheio',
        cursinhoId: 'cur-outro',
      });
    }, 120_000);

    it('conta cartões enviados e, à parte, os com leitura concluída', async () => {
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      const l1 = r.find((s) => s.simuladoId === SIM_L1.toString());
      // três enviaram: completo, falho e órfão
      expect(l1!.cartoes).toBe(3);
      // só o completo conta — o falho e o órfão não
      expect(l1!.comLeituraConcluida).toBe(1);
    });

    it('linha cuja ref de histórico morreu CONTINUA contando como cartão enviado', async () => {
      // sem `preserveNullAndEmptyArrays`, o $unwind descarta essa linha e o
      // total passa a ser menor que o número de cartões que chegaram — sem
      // nada acusar. O repositório já tipa `historico: Historico | null`
      // justamente porque essa órfã existe.
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      expect(r.find((s) => s.simuladoId === SIM_L1.toString())!.cartoes).toBe(3);
    });

    it('turmaId restringe à turma', async () => {
      const r = await repo.listarSimuladosComCartao({
        cursinhoId: CUR,
        turmaId: 't-A',
      });

      // u-l1 e u-l3 são da turma A; u-l2 é da B
      expect(r.find((s) => s.simuladoId === SIM_L1.toString())!.cartoes).toBe(2);
    });

    it('simulado de outro cursinho não aparece, e o alheio não soma no meu', async () => {
      const r = await repo.listarSimuladosComCartao({ cursinhoId: 'cur-outro' });

      expect(r).toHaveLength(1);
      expect(r[0].cartoes).toBe(1);
    });

    it('ordena por ultimoEnvio decrescente', async () => {
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      expect(r[0].simuladoId).toBe(SIM_L2.toString());
      expect(r[1].simuladoId).toBe(SIM_L1.toString());
    });

    it('ultimoEnvio é preenchido mesmo quando a linha nasce pelo upsert do registrar', async () => {
      // ⚠️ O schema da junção é `timestamps: false`; `createdAt` vem do
      // `BaseSchema` com default. O `registrar` escreve por UPSERT, e se o
      // default não fosse aplicado no insert a ordenação inteira viraria nula
      // em produção — e passaria nos testes acima, que usam `create`.
      const SIM_UP = new Types.ObjectId();
      const h = await histModel.create({
        usuario: 'u-up', simulado: SIM_UP, status: 'completed',
      });
      await repo.registrar({
        historicoId: h._id.toString(),
        simuladoId: SIM_UP.toString(),
        usuario: 'u-up',
        cursinhoId: 'cur-upsert',
      });

      const r = await repo.listarSimuladosComCartao({ cursinhoId: 'cur-upsert' });

      expect(r[0].ultimoEnvio).toBeInstanceOf(Date);
    });

    it('recorte sem nenhum cartão devolve lista vazia, não erro', async () => {
      await expect(
        repo.listarSimuladosComCartao({ cursinhoId: 'cur-que-nao-existe' }),
      ).resolves.toEqual([]);
    });

    it('turmaId ausente NÃO vira filtro por turma nula', async () => {
      // `{turmaId: undefined}` serializa para `{turmaId: null}` e casaria só
      // quem não tem turma — lição medida no card 02. Todos os do CUR têm
      // turma, então um filtro indevido devolveria lista vazia.
      const r = await repo.listarSimuladosComCartao({ cursinhoId: CUR });

      expect(r.length).toBeGreaterThan(0);
    });
  });
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`
Expected: FAIL — `repo.listarSimuladosComCartao is not a function`.

- [ ] **Step 4: Implementar a agregação**

No `relatorio-simulado-estudante.repository.ts`, acrescente o tipo junto dos outros exportados no topo do arquivo (perto de `AgregadoDaQuestao`):

```ts
export interface SimuladoComCartao {
  simuladoId: string;
  cartoes: number;
  comLeituraConcluida: number;
  ultimoEnvio: Date | null;
}
```

E o método, no fim da classe:

```ts
  /**
   * Quais simulados têm cartão neste recorte, e quantos.
   *
   * ⚠️ **Parece irmã da `agregarPorQuestao` e não é.** Lá o `$unwind` é
   * estrito e seguido de `$match: { 'h.status': completed }`, porque o
   * objetivo é DESCARTAR quem não completou. Aqui o objetivo é o oposto:
   * contar todo mundo que enviou e classificar por status. Por isso
   * `preserveNullAndEmptyArrays: true` — sem ele, a linha cuja ref de
   * `Historico` morreu (o mesmo caso que faz `LinhaComHistorico.historico`
   * ser `| null`) some da contagem, e `cartoes` fica menor que o número de
   * cartões que realmente chegaram, sem nada acusar.
   *
   * ⚠️ `ultimoEnvio` é o `$max` do `createdAt` das LINHAS, e `registrar` é
   * upsert: um reenvio do mesmo estudante não rebumba a data. Logo isto é
   * "quando o estudante mais recente entrou no recorte", não "última
   * atividade" — o consumidor não deve exibi-lo como tal.
   */
  async listarSimuladosComCartao(params: {
    cursinhoId: string;
    turmaId?: string;
  }): Promise<SimuladoComCartao[]> {
    // `{turmaId: undefined}` serializa para `{turmaId: null}` e casaria só
    // quem NÃO tem turma — a chave precisa estar ausente. Lição do card 02.
    const match: Record<string, unknown> = { cursinhoId: params.cursinhoId };
    if (params.turmaId !== undefined) {
      match.turmaId = params.turmaId;
    }

    const linhas = await this.model
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'historicos',
            localField: 'historico',
            foreignField: '_id',
            as: 'h',
          },
        },
        { $unwind: { path: '$h', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$simulado',
            cartoes: { $sum: 1 },
            comLeituraConcluida: {
              $sum: {
                $cond: [
                  { $eq: ['$h.status', HistoricoStatus.Completed] },
                  1,
                  0,
                ],
              },
            },
            ultimoEnvio: { $max: '$createdAt' },
          },
        },
        { $sort: { ultimoEnvio: -1 } },
      ])
      .exec();

    return linhas.map((l) => ({
      simuladoId: l._id.toString(),
      cartoes: l.cartoes,
      comLeituraConcluida: l.comLeituraConcluida,
      ultimoEnvio: l.ultimoEnvio ?? null,
    }));
  }
```

`HistoricoStatus` já está importado no topo do arquivo.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`
Expected: PASS, todos.

⚠️ **Se o teste do upsert falhar** (`ultimoEnvio` nulo), NÃO conserte trocando a ordenação. Pare e reporte: significa que o default do `BaseSchema` não é aplicado no upsert, e a decisão de ordenação do spec precisa ser revista.

- [ ] **Step 6: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts
git commit -m "feat: agregacao dos simulados com cartao por recorte"
```

---

## Task 3: O nome do simulado, e o DTO

O nome não está na junção. Uma leitura magra por ids e um `Map` no serviço — a mesma decisão do card `03` para o número da questão, e pelo mesmo motivo: `$lookup` aninhado para buscar um campo custa mais complexidade do que ler documentos pequenos.

**Files:**
- Modify: `src/modules/simulado/simulado.repository.ts`
- Create: `src/modules/relatorio-simulado-estudante/dtos/simulados-com-cartao.dto.output.ts`
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

A service tem dois dependentes no construtor — `RelatorioSimuladoEstudanteRepository` e
`SimuladoRepository`, nessa ordem. Acrescente um `describe` novo no fim do
`relatorio-simulado-estudante.service.spec.ts`, com helper próprio (os outros `describe` do arquivo
têm os seus; não reaproveite nem altere os deles):

```ts
describe('RelatorioSimuladoEstudanteService.listarSimulados', () => {
  const montarLista = (over?: {
    agregado?: any[];
    nomes?: { id: string; nome: string }[];
  }) => {
    const repository = {
      listarSimuladosComCartao: jest
        .fn()
        .mockResolvedValue(over?.agregado ?? []),
    };
    const simuladoRepository = {
      getNomesPorIds: jest.fn().mockResolvedValue(over?.nomes ?? []),
    };
    const svc = new RelatorioSimuladoEstudanteService(
      repository as any,
      simuladoRepository as any,
    );
    return { svc, repository, simuladoRepository };
  };

  it('junta o nome ao agregado, pelo id', async () => {
    const { svc } = montarLista({
      agregado: [
        { simuladoId: 's1', cartoes: 3, comLeituraConcluida: 2, ultimoEnvio: new Date('2026-05-02') },
      ],
      nomes: [{ id: 's1', nome: 'ENEM 2024 — 1º dia' }],
    });

    const r = await svc.listarSimulados({ cursinhoId: 'cur-1' });

    expect(r.simulados[0]).toEqual({
      simuladoId: 's1',
      nome: 'ENEM 2024 — 1º dia',
      cartoes: 3,
      comLeituraConcluida: 2,
      ultimoEnvio: new Date('2026-05-02'),
    });
  });

  it('simulado apagado depois do vínculo vira nome nulo, e NÃO some da lista', async () => {
    // Sumir esconderia cartões que existem — é o oposto do que esta série
    // inteira quer. A tela decide como rotular; o número continua honesto.
    const { svc } = montarLista({
      agregado: [
        { simuladoId: 's-morto', cartoes: 2, comLeituraConcluida: 1, ultimoEnvio: new Date() },
      ],
      nomes: [],
    });

    const r = await svc.listarSimulados({ cursinhoId: 'cur-1' });

    expect(r.simulados).toHaveLength(1);
    expect(r.simulados[0].nome).toBeNull();
    expect(r.simulados[0].cartoes).toBe(2);
  });

  it('pede os nomes SÓ dos ids que o agregado devolveu', async () => {
    const { svc, simuladoRepository } = montarLista({
      agregado: [
        { simuladoId: 's1', cartoes: 1, comLeituraConcluida: 1, ultimoEnvio: new Date() },
        { simuladoId: 's2', cartoes: 1, comLeituraConcluida: 0, ultimoEnvio: new Date() },
      ],
    });

    await svc.listarSimulados({ cursinhoId: 'cur-1' });

    expect(simuladoRepository.getNomesPorIds).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('repassa o turmaId ao repositório', async () => {
    const { svc, repository } = montarLista();

    await svc.listarSimulados({ cursinhoId: 'cur-1', turmaId: 't-1' });

    expect(repository.listarSimuladosComCartao).toHaveBeenCalledWith({
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('recorte vazio devolve { simulados: [] } e não consulta nome nenhum', async () => {
    const { svc, simuladoRepository } = montarLista({ agregado: [] });

    const r = await svc.listarSimulados({ cursinhoId: 'cur-vazio' });

    expect(r).toEqual({ simulados: [] });
    expect(simuladoRepository.getNomesPorIds).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`
Expected: FAIL — `svc.listarSimulados is not a function`.

- [ ] **Step 3: Criar o DTO**

`src/modules/relatorio-simulado-estudante/dtos/simulados-com-cartao.dto.output.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class SimuladoComCartaoDtoOutput {
  @ApiProperty()
  simuladoId: string;

  /**
   * `null` quando o `Simulado` foi apagado depois do vínculo. A entrada
   * **não** some da lista: os cartões existem, e escondê-los seria o oposto
   * do que o relatório serve para fazer.
   */
  @ApiProperty({ nullable: true })
  nome: string | null;

  /** Quantos ESTUDANTES enviaram — o grão da junção é o estudante, não a tentativa. */
  @ApiProperty()
  cartoes: number;

  @ApiProperty()
  comLeituraConcluida: number;

  /**
   * Quando o estudante mais recente entrou no recorte. O `registrar` é upsert,
   * então reenvio do mesmo estudante NÃO move esta data — não exibir como
   * "última atividade".
   */
  @ApiProperty({ nullable: true })
  ultimoEnvio: Date | null;
}

export class SimuladosComCartaoDtoOutput {
  @ApiProperty({ type: [SimuladoComCartaoDtoOutput] })
  simulados: SimuladoComCartaoDtoOutput[];
}
```

- [ ] **Step 4: Acrescentar `getNomesPorIds` ao `SimuladoRepository`**

Em `src/modules/simulado/simulado.repository.ts`, logo depois de `getNumerosDasQuestoes`:

```ts
  /**
   * Só `(id, nome)`. O `getById` popula categoria, frentes e matéria — carga
   * enorme para ler um nome, que é tudo que a lista de simulados com cartão
   * (card 04b) precisa.
   */
  async getNomesPorIds(ids: string[]): Promise<{ id: string; nome: string }[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) } }, { nome: 1 })
      .lean()
      .exec();
    return docs.map((d: any) => ({ id: d._id.toString(), nome: d.nome }));
  }
```

`Types` já está importado no topo do arquivo.

- [ ] **Step 5: Implementar `listarSimulados` na service**

Em `relatorio-simulado-estudante.service.ts`, importe o DTO no topo:

```ts
import { SimuladosComCartaoDtoOutput } from './dtos/simulados-com-cartao.dto.output';
```

E acrescente o método no fim da classe:

```ts
  async listarSimulados(params: {
    cursinhoId: string;
    turmaId?: string;
  }): Promise<SimuladosComCartaoDtoOutput> {
    const agregado = await this.repository.listarSimuladosComCartao(params);
    if (agregado.length === 0) return { simulados: [] };

    const nomes = await this.simuladoRepository.getNomesPorIds(
      agregado.map((a) => a.simuladoId),
    );
    const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));

    // A ordem vem do repositório (ultimoEnvio desc) e é preservada: o `map`
    // não reordena, e não há `sort` aqui de propósito.
    return {
      simulados: agregado.map((a) => ({
        simuladoId: a.simuladoId,
        // `?? null`: simulado apagado depois do vínculo não some da lista —
        // os cartões existem e escondê-los é pior que rotulá-los.
        nome: nomePorId.get(a.simuladoId) ?? null,
        cartoes: a.cartoes,
        comLeituraConcluida: a.comLeituraConcluida,
        ultimoEnvio: a.ultimoEnvio,
      })),
    };
  }
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts src/modules/simulado`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/simulado/simulado.repository.ts src/modules/relatorio-simulado-estudante/dtos/simulados-com-cartao.dto.output.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts
git commit -m "feat: nome do simulado na lista de cartoes do recorte"
```

---

## Task 4: A rota do ms, declarada antes do `:simuladoId`

⚠️ **Esta é a parte que um teste de unidade não pega.** `@Get('simulados')` e `@Get(':simuladoId')` têm a **mesma contagem de segmentos** — colidem de verdade, e só a ordem de declaração resolve. Um teste que chama o método direto passa mesmo com a ordem errada. Precisa subir o app.

Sintoma se passar despercebido: `simulados` vira o valor de `:simuladoId`, o `Types.ObjectId.isValid` recusa, e a rota responde **400**.

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts` (bloco HTTP)
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

**(a)** No bloco `describe('HTTP: controller → service → repositório → Mongo', ...)` do `isolamento.spec.ts`, acrescente:

```ts
    it('GET /simulados resolve para a rota literal, não para :simuladoId', async () => {
      // ⚠️ `simulados` e `:simuladoId` têm a MESMA contagem de segmentos.
      // Declarada depois, a literal é capturada pelo param, `isValid` recusa
      // e isto vira 400. Só um app de verdade pega — teste de unidade chama
      // o método direto e passa com a ordem errada.
      const res = await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/simulados')
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      expect(Array.isArray(res.body.simulados)).toBe(true);
      expect(res.body.simulados[0]).toMatchObject({
        simuladoId: expect.any(String),
        cartoes: expect.any(Number),
        comLeituraConcluida: expect.any(Number),
      });
    });

    it('GET /simulados sem cursinhoId recusa com 400', async () => {
      await request(app.getHttpServer())
        .get('/v1/relatorio-simulado/simulados')
        .expect(400);
    });
```

**(b)** No `relatorio-simulado-estudante.controller.spec.ts`. O `montar()` do arquivo dubla só
`consultar`; acrescente `listarSimulados` a ele — **aditivo**, sem tocar no resto:

```ts
const montar = () => {
  const service = {
    consultar: jest
      .fn()
      .mockResolvedValue({ linhas: [], totalEstudantesComCartaoNoCursinho: 0 }),
    listarSimulados: jest.fn().mockResolvedValue({ simulados: [] }),
  };
  ...
```

e o teste, no fim do `describe` existente:

```ts
  it('listarSimulados repassa cursinho e turma ao serviço', async () => {
    const { ctrl, service } = montar();

    await ctrl.listarSimulados({ cursinhoId: 'cur-1', turmaId: 't-1' } as any);

    expect(service.listarSimulados).toHaveBeenCalledWith({
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: FAIL — o HTTP dá 400 (ou 404) e o de unidade diz que `listarSimulados` não existe no controller.

- [ ] **Step 3: Implementar a rota, COMO PRIMEIRO `@Get` da classe**

Em `relatorio-simulado-estudante.controller.ts`, importe o DTO:

```ts
import { SimuladosComCartaoDtoOutput } from './dtos/simulados-com-cartao.dto.output';
```

E insira este handler **antes** do `@Get(':simuladoId/questoes')` — isto é, como o primeiro método depois do construtor:

```ts
  /**
   * ⚠️ **PRIMEIRA rota da classe, e isso não é estilo.** `simulados` tem a
   * mesma contagem de segmentos que `:simuladoId`; declarada depois, o param
   * a captura, `Types.ObjectId.isValid('simulados')` recusa, e a rota
   * responde 400. Nenhum teste de unidade pega — só um que suba o app.
   */
  @Get('simulados')
  @ApiResponse({
    status: 200,
    description: 'simulados com cartão no recorte do cursinho (ou da turma)',
    type: SimuladosComCartaoDtoOutput,
  })
  async listarSimulados(
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<SimuladosComCartaoDtoOutput> {
    return this.service.listarSimulados({
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Provar que o teste discrimina**

Mova o `@Get('simulados')` para **depois** do `@Get(':simuladoId')` e rode de novo. O teste HTTP tem que **falhar** (400). Devolva o método ao topo e confirme verde.

⚠️ Reporte exatamente o que viu. Se o teste passar com a rota no fim, ele não está protegendo nada e precisa ser refeito.

- [ ] **Step 6: Build, lint e commit**

```bash
npm run build
npx eslint src/modules/relatorio-simulado-estudante src/modules/simulado/simulado.repository.ts
git add src/modules/relatorio-simulado-estudante/
git commit -m "feat: rota dos simulados com cartao no ms, antes do :simuladoId"
```

⚠️ **Não rode `yarn lint`** — ele reformata o repositório inteiro.

---

## Task 5: O proxy na api

**Repo:** `api-vcnafacul` — `cd ../api-vcnafacul`, branch `feature/04b-simulados-com-cartao` (já criada, sai do `04`).

**Files:**
- Modify: `src/modules/simulado/relatorio/relatorio-http.service.ts`
- Create: `src/modules/simulado/relatorio/dtos/simulados-com-cartao.dto.output.ts`
- Modify: `src/modules/simulado/relatorio/relatorio.service.ts`
- Test: `src/modules/simulado/relatorio/relatorio-http.service.spec.ts`
- Test: `src/modules/simulado/relatorio/relatorio.service.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

**(a)** Em `relatorio-http.service.spec.ts` (leia o arquivo primeiro para reusar o `montar()` existente):

```ts
  it('buscarSimulados monta a URL com cursinhoId e sem :simuladoId', async () => {
    const { svc, axios } = montar();

    await svc.buscarSimulados('cur-1');

    expect(axios.get).toHaveBeenCalledWith(
      'v1/relatorio-simulado/simulados?cursinhoId=cur-1',
    );
  });

  it('buscarSimulados OMITE turmaId quando não vem', async () => {
    // `turmaId=` vazio chega ao ms como filtro por '' e devolve lista vazia
    const { svc, axios } = montar();

    await svc.buscarSimulados('cur-1');

    expect(axios.get.mock.calls[0][0]).not.toContain('turmaId');
  });

  it('buscarSimulados inclui turmaId quando vem', async () => {
    const { svc, axios } = montar();

    await svc.buscarSimulados('cur-1', 't-1');

    expect(axios.get).toHaveBeenCalledWith(
      'v1/relatorio-simulado/simulados?cursinhoId=cur-1&turmaId=t-1',
    );
  });
```

**(b)** Em `relatorio.service.spec.ts`, **primeiro amplie o `montar()` de forma aditiva**. Ele hoje
devolve `{ svc, http, studentCourseRepository, classRepository }` e o dublê de `http` só tem
`buscarLinhas` e `buscarQuestoes`. Duas mudanças, nenhuma delas altera teste existente:

```ts
  const http = {
    buscarLinhas: jest.fn().mockResolvedValue({
      linhas: over.linhas ?? [],
      totalEstudantesComCartaoNoCursinho: over.totalNoCursinho ?? 0,
    }),
    buscarQuestoes: jest.fn().mockResolvedValue({ questoes: [] }),
    buscarSimulados: jest
      .fn()
      .mockResolvedValue({ simulados: over.simulados ?? [] }),
  };
```

e acrescente `cursinhoResolver` ao objeto retornado:

```ts
  return {
    svc: new RelatorioService(
      http as any,
      studentCourseRepository as any,
      classRepository as any,
      cursinhoResolver as any,
    ),
    http,
    studentCourseRepository,
    classRepository,
    cursinhoResolver,
  };
```

⚠️ **Só acrescente.** Não mude o que já está lá — os testes dos outros métodos dependem do helper
exatamente como está.

Depois, os testes:

```ts
describe('RelatorioService.listarSimulados', () => {
  it('resolve o cursinho pelo JWT e repassa — nenhum parâmetro o troca', async () => {
    const { svc, http, cursinhoResolver } = montar();

    await svc.listarSimulados('colab-1');

    expect(cursinhoResolver.resolveCursinhoIdByUserId).toHaveBeenCalledWith(
      'colab-1',
    );
    expect(http.buscarSimulados).toHaveBeenCalledWith('cur-1', undefined);
  });

  it('com turma, repassa as duas coisas', async () => {
    const { svc, http } = montar();

    await svc.listarSimulados('colab-1', 't-1');

    expect(http.buscarSimulados).toHaveBeenCalledWith('cur-1', 't-1');
  });

  it('turma de outro cursinho dá 403, e o ms nem é chamado', async () => {
    // é o `resolverEscopo` do card 04 fazendo o trabalho — não uma validação
    // nova. Se esta rota tivesse a sua própria, as duas divergiriam.
    const { svc, http } = montar({ turma: null });

    await expect(svc.listarSimulados('colab-1', 't-alheia')).rejects.toThrow(
      ForbiddenException,
    );
    expect(http.buscarSimulados).not.toHaveBeenCalled();
  });

  it('devolve o que o ms mandou, sem reescrever', async () => {
    const simulados = [
      {
        simuladoId: 's1',
        nome: 'ENEM',
        cartoes: 3,
        comLeituraConcluida: 2,
        ultimoEnvio: '2026-05-02T00:00:00.000Z',
      },
    ];
    const { svc } = montar({ simulados });

    await expect(svc.listarSimulados('colab-1')).resolves.toEqual({
      simulados,
    });
  });
});
```

`ForbiddenException` já está importado no topo do `relatorio.service.spec.ts`.

⚠️ **O `resolverEscopo` do card `04` já valida turma × cursinho e lança 403**
(`relatorio.service.ts:115-130`). `listarSimulados` tem que usar **o mesmo método privado**, não uma validação nova — senão a turma de outro cursinho passaria por aqui.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx jest src/modules/simulado/relatorio`
Expected: FAIL — `buscarSimulados` e `listarSimulados` não existem.

- [ ] **Step 3: Implementar o `buscarSimulados` no http service**

Em `relatorio-http.service.ts`, depois de `buscarQuestoes`:

```ts
  async buscarSimulados(
    cursinhoId: string,
    turmaId?: string,
  ): Promise<unknown> {
    return this.axios.get(
      `v1/relatorio-simulado/simulados?${this.query(cursinhoId, turmaId)}`,
    );
  }
```

- [ ] **Step 4: Criar o DTO espelho**

`src/modules/simulado/relatorio/dtos/simulados-com-cartao.dto.output.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * Espelha o DTO do ms-simulado. Redeclarado porque os repositórios são
 * separados e o tipo de lá não é importável — a mesma razão pela qual
 * `QuestoesDoRelatorioDtoOutput` existe duas vezes.
 */
export class SimuladoComCartaoDtoOutput {
  @ApiProperty()
  simuladoId: string;

  /** `null` quando o simulado foi apagado depois do vínculo. */
  @ApiProperty({ nullable: true })
  nome: string | null;

  /** Quantos ESTUDANTES enviaram cartão, não quantas fotos chegaram. */
  @ApiProperty()
  cartoes: number;

  @ApiProperty()
  comLeituraConcluida: number;

  /**
   * Quando o estudante mais recente entrou no recorte. Reenvio do mesmo
   * estudante não move esta data — não exibir como "última atividade".
   */
  @ApiProperty({ nullable: true })
  ultimoEnvio: Date | null;
}

export class SimuladosComCartaoDtoOutput {
  @ApiProperty({ type: [SimuladoComCartaoDtoOutput] })
  simulados: SimuladoComCartaoDtoOutput[];
}
```

- [ ] **Step 5: Implementar `listarSimulados` na service**

Em `relatorio.service.ts`, importe o DTO e acrescente o método. **Use o `resolverEscopo` que já existe** — leia-o antes (`grep -n "resolverEscopo" -A 25 src/modules/simulado/relatorio/relatorio.service.ts`):

```ts
  /**
   * Proxy puro: nenhuma hidratação. Esta rota devolve simulados, não pessoas,
   * então o MySQL não entra. O `resolverEscopo` é o MESMO do relatório — é
   * ele que resolve o cursinho pelo JWT e recusa turma de outro cursinho.
   */
  async listarSimulados(
    colaboradorUserId: string,
    turmaId?: string,
  ): Promise<SimuladosComCartaoDtoOutput> {
    const cursinhoId = await this.resolverEscopo(colaboradorUserId, turmaId);
    return this.http.buscarSimulados(
      cursinhoId,
      turmaId,
    ) as Promise<SimuladosComCartaoDtoOutput>;
  }
```

- [ ] **Step 6: Rodar e confirmar que passam**

Run: `npx jest src/modules/simulado/relatorio`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/simulado/relatorio/relatorio-http.service.ts src/modules/simulado/relatorio/relatorio-http.service.spec.ts src/modules/simulado/relatorio/dtos/simulados-com-cartao.dto.output.ts src/modules/simulado/relatorio/relatorio.service.ts src/modules/simulado/relatorio/relatorio.service.spec.ts
git commit -m "feat: proxy dos simulados com cartao na api"
```

---

## Task 6: As rotas da api, com a literal antes do param

⚠️ **Aqui a colisão é idêntica à do ms.** `@Get('simulados')` e `@Get(':simuladoId')` têm a mesma contagem de segmentos. O `relatorio-rotas.controller.spec.ts` já existe e sobe um app — é lá que isto se prova.

Duas rotas: a geral e a por turma.

**Files:**
- Modify: `src/modules/simulado/relatorio/relatorio.controller.ts`
- Test: `src/modules/simulado/relatorio/relatorio-rotas.controller.spec.ts`
- Test: `src/modules/simulado/relatorio/relatorio.controller.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

**(a)** Em `relatorio-rotas.controller.spec.ts`, acrescente ao mock de service `listarSimulados: jest.fn()` e ao `beforeEach` `service.listarSimulados.mockResolvedValue({ simulados: [] });`. Depois:

```ts
  it('GET /simulados resolve para a literal, não para :simuladoId', async () => {
    // mesma contagem de segmentos que `:simuladoId` — declarada depois, o
    // param a captura e o handler errado roda com simuladoId="simulados"
    await request(app.getHttpServer())
      .get('/mssimulado/relatorio/simulado/simulados')
      .expect(200);

    expect(service.listarSimulados).toHaveBeenCalledWith('colab-1', undefined);
    expect(service.consultar).not.toHaveBeenCalled();
  });

  it('GET /simulados/turma/:turmaId resolve para a literal com turma', async () => {
    await request(app.getHttpServer())
      .get('/mssimulado/relatorio/simulado/simulados/turma/t-1')
      .expect(200);

    expect(service.listarSimulados).toHaveBeenCalledWith('colab-1', 't-1');
    expect(service.consultar).not.toHaveBeenCalled();
  });
```

**(b)** Em `relatorio.controller.spec.ts`, acrescente `'simulados'` e `'simuladosPorTurma'` à lista do `it.each` que fixa a permissão por handler:

```ts
  it.each([
    ['geral'], ['porTurma'], ['questoesGeral'], ['questoesPorTurma'],
    ['simulados'], ['simuladosPorTurma'],
  ])(
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx jest src/modules/simulado/relatorio`
Expected: FAIL — 404/500 nas rotas novas, e `undefined` no metadado dos dois handlers novos.

- [ ] **Step 3: Implementar as rotas, como os PRIMEIROS `@Get` da classe**

Em `relatorio.controller.ts`, importe o DTO:

```ts
import { SimuladosComCartaoDtoOutput } from './dtos/simulados-com-cartao.dto.output';
```

E insira os dois handlers **antes** do `@Get(':simuladoId/turma/:turmaId/questoes')` — como os primeiros métodos depois do construtor:

```ts
  /**
   * ⚠️ **PRIMEIRAS rotas da classe, e isso não é estilo.** `simulados` tem a
   * mesma contagem de segmentos que `:simuladoId`; declarada depois, o param
   * a captura e o handler errado roda com `simuladoId = "simulados"`.
   * Nenhum teste de unidade pega — só o `relatorio-rotas.controller.spec.ts`,
   * que sobe o app.
   */
  @Get('simulados/turma/:turmaId')
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'simulados com cartão da turma',
    type: SimuladosComCartaoDtoOutput,
  })
  @ApiResponse(RESPOSTA_403)
  @SetMetadata(PermissionsGuard.name, Permissions.gerenciarEstudantes)
  async simuladosPorTurma(
    @Param('turmaId') turmaId: string,
    @Req() req: Request,
  ): Promise<SimuladosComCartaoDtoOutput> {
    return this.service.listarSimulados((req.user as User).id, turmaId);
  }

  @Get('simulados')
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'simulados com cartão do cursinho',
    type: SimuladosComCartaoDtoOutput,
  })
  @ApiResponse(RESPOSTA_403)
  @SetMetadata(PermissionsGuard.name, Permissions.gerenciarEstudantes)
  async simulados(@Req() req: Request): Promise<SimuladosComCartaoDtoOutput> {
    return this.service.listarSimulados((req.user as User).id);
  }
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx jest src/modules/simulado/relatorio`
Expected: PASS

- [ ] **Step 5: Provar que o teste discrimina**

Mova os dois handlers novos para **depois** do `@Get(':simuladoId')` e rode. Os dois testes de rota têm que **falhar**. Devolva ao topo e confirme verde.

⚠️ Reporte exatamente o que viu nas duas direções.

- [ ] **Step 6: Suíte, build e commit**

```bash
npx jest src/modules/simulado src/modules/prepCourse
npm run build
git add src/modules/simulado/relatorio/relatorio.controller.ts src/modules/simulado/relatorio/relatorio-rotas.controller.spec.ts src/modules/simulado/relatorio/relatorio.controller.spec.ts
git commit -m "feat: rotas dos simulados com cartao na api, antes do :simuladoId"
```

⚠️ **Não rode `npm test`** — ele sobe Docker MySQL e roda a e2e inteira.
