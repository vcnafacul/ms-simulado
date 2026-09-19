# O agregado por questão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao professor o número que ele usa para decidir o que revisar em aula — por questão do simulado, quantos do recorte acertaram, quantos erraram, quantos ficaram sem leitura, e como as marcações se distribuíram entre A–E.

**Architecture:** Uma agregação parte da coleção de junção (que já impõe o recorte cursinho/turma), faz `$lookup` nos históricos, abre `respostas` com `$unwind` e agrupa por questão. O número de cada questão não está na resposta — vem do `Simulado`, resolvido no serviço com uma leitura leve e um `Map`. Contagens, nunca percentuais.

**Tech Stack:** NestJS 10 + Mongoose, Jest, mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-09-19-agregado-por-questao-design.md`
**Card:** `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/03-BACK-agregado-por-questao.md`

**Repo:** `ms-simulado` · **Branch:** `feature/03-agregado-por-questao` (já criada, spec já commitado)

Tests: `npx jest <path>` e **`yarn test`** (o CI usa yarn, não npm). Build: `yarn build`. Lint: `npx eslint <arquivos>` — **nunca `npm run lint`**, ele carrega `--fix`. Working tree limpa; **adicione arquivos por nome** no commit.

---

## O que a investigação já fixou

⚠️ **O "em branco" não precisa de normalização nova.** `SimuladoService.processAnswer` mapeia
**todas** as `simulado.questoes` e grava `alternativaEstudante: resposta?.alternativaEstudante`.
Medido num Mongo de verdade, a resposta não marcada fica assim no banco:

```json
{"questao":"…f3","alternativaCorreta":"C"}
```

A chave `alternativaEstudante` **não existe** — não é `null`, não é `""`. `$ifNull` a identifica.

⚠️ **`alternativaCorreta` está em cada resposta**, então acerto sai da própria linha.

⚠️ **A coleção de históricos se chama `historicos`** (confirmado via `mongoose.pluralize()`), que é o
`from` do `$lookup`.

⚠️ **`Alternativa` é um enum fechado A–E** (`questao/enums/alternativa.enum.ts`).

---

## Estrutura de arquivos

| arquivo | responsabilidade | ação |
|---|---|---|
| `src/modules/simulado/simulado.repository.ts` | Ganha uma leitura leve dos números das questões | modificar |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts` | Ganha a agregação `agregarPorQuestao` | modificar |
| `src/modules/relatorio-simulado-estudante/dtos/questoes-do-relatorio.dto.output.ts` | A forma que a aba de questões consome | **criar** |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts` | Aplica o número e ordena | modificar |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts` | `GET :simuladoId/questoes` | modificar |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts` | Importa o `SimuladoModule` | modificar |

⚠️ **Importar `SimuladoModule` segue o padrão da casa** — o `CartaoRespostaModule` já faz
(`cartao-resposta.module.ts:17`). E não cria ciclo: o `simulado.module.spec.ts` tem um teste que
garante que o `SimuladoModule` **não** importa o módulo do relatório; esta é a aresta contrária.

---

## Task 1: A leitura leve dos números

**Files:**
- Modify: `src/modules/simulado/simulado.repository.ts`
- Test: `src/modules/simulado/simulado.repository.spec.ts`

O `getById` que já existe popula `categoria`, `questoes.questao`, `frente1` e `materia` — carga
enorme para ler um número. Este card precisa só de `(questaoId, numero)`.

- [ ] **Step 1: Write the failing test**

Acrescente a `src/modules/simulado/simulado.repository.spec.ts`:

```ts
describe('SimuladoRepository.getNumerosDasQuestoes', () => {
  const montar = (doc: unknown) => {
    const exec = jest.fn().mockResolvedValue(doc);
    const lean = jest.fn().mockReturnValue({ exec });
    const findById = jest.fn().mockReturnValue({ lean });
    const repo = new SimuladoRepository({ findById } as any);
    return { repo, findById };
  };

  it('devolve o par (questaoId, numero) de cada questão', async () => {
    const { repo } = montar({
      questoes: [
        { questao: 'q1', numero: 5 },
        { questao: 'q2', numero: 6 },
      ],
    });

    await expect(repo.getNumerosDasQuestoes('665f0c1a2b3c4d5e6f00abc2')).resolves.toEqual([
      { questaoId: 'q1', numero: 5 },
      { questaoId: 'q2', numero: 6 },
    ]);
  });

  it('projeta só o que precisa — não carrega enunciado nem matéria', async () => {
    const { repo, findById } = montar({ questoes: [] });

    await repo.getNumerosDasQuestoes('665f0c1a2b3c4d5e6f00abc2');

    // o getById popula categoria/frente/matéria; aqui isso seria carga inútil
    expect(findById).toHaveBeenCalledWith(
      '665f0c1a2b3c4d5e6f00abc2',
      expect.objectContaining({ 'questoes.questao': 1, 'questoes.numero': 1 }),
    );
  });

  it('simulado inexistente devolve lista vazia, não erro', async () => {
    const { repo } = montar(null);

    await expect(
      repo.getNumerosDasQuestoes('665f0c1a2b3c4d5e6f00abc2'),
    ).resolves.toEqual([]);
  });

  it('questão sem número vem com numero null, não some', async () => {
    // numero é nullable: questão vinculada à prova sem posição definida
    const { repo } = montar({ questoes: [{ questao: 'q1', numero: null }] });

    await expect(
      repo.getNumerosDasQuestoes('665f0c1a2b3c4d5e6f00abc2'),
    ).resolves.toEqual([{ questaoId: 'q1', numero: null }]);
  });
});
```

✅ Verificado: `SimuladoRepository` recebe o model como primeiro argumento
(`@InjectModel(Simulado.name) model`), e o `simulado.repository.spec.ts` já monta dublês assim
(`new SimuladoRepository({ countDocuments } as any)`). **Não mude o construtor.**

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/simulado/simulado.repository.spec.ts`
Expected: FAIL — `repo.getNumerosDasQuestoes is not a function`

- [ ] **Step 3: Write the implementation**

Em `src/modules/simulado/simulado.repository.ts`, logo depois de `getById`:

```ts
  /**
   * Só `(questaoId, numero)`. O `getById` popula categoria, frentes e matéria —
   * carga enorme para ler um número, que é tudo que o agregado por questão do
   * card 03 precisa para dizer "questão 5" em vez de "questão 65f3a…".
   */
  async getNumerosDasQuestoes(
    id: string,
  ): Promise<{ questaoId: string; numero: number | null }[]> {
    const doc = await this.model
      .findById(id, { 'questoes.questao': 1, 'questoes.numero': 1 })
      .lean()
      .exec();
    if (!doc) return [];
    return ((doc as any).questoes ?? []).map((qc: any) => ({
      questaoId: qc.questao?.toString(),
      numero: qc.numero ?? null,
    }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/simulado/simulado.repository.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/simulado/simulado.repository.ts \
        src/modules/simulado/simulado.repository.spec.ts
git commit -m "feat: leitura leve dos números das questões de um simulado"
```

---

## Task 2: A agregação

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `relatorio-simulado-estudante.repository.spec.ts` (o arquivo já importa
`Types`, o repositório e a constante `SIM`):

```ts
describe('RelatorioSimuladoEstudanteRepository.agregarPorQuestao', () => {
  const montarAgg = () => {
    const aggregate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });
    const repo = new RelatorioSimuladoEstudanteRepository({ aggregate } as any);
    return { repo, aggregate };
  };

  const estagio = (pipeline: any[], chave: string) =>
    pipeline.find((e) => Object.keys(e)[0] === chave);

  it('impõe o recorte no $match, igual à consulta por linha', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const match = estagio(aggregate.mock.calls[0][0], '$match').$match;
    expect(match.simulado.toString()).toBe(SIM);
    expect(match.cursinhoId).toBe('cur-1');
    // mesma armadilha do card 02: `{turmaId: undefined}` casaria só quem não tem turma
    expect('turmaId' in match).toBe(false);
  });

  it('com turmaId, restringe a agregação à turma', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });

    expect(estagio(aggregate.mock.calls[0][0], '$match').$match.turmaId).toBe(
      't-1',
    );
  });

  it('junta com a coleção historicos', async () => {
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    const lookup = estagio(aggregate.mock.calls[0][0], '$lookup').$lookup;
    expect(lookup.from).toBe('historicos');
    expect(lookup.localField).toBe('historico');
    expect(lookup.foreignField).toBe('_id');
  });

  it('NÃO preserva vazios no $unwind — cartão sem leitura não vota', async () => {
    // com preserveNullAndEmptyArrays, um histórico failed (sem `respostas`)
    // entraria como respondente de todas as questões
    const { repo, aggregate } = montarAgg();

    await repo.agregarPorQuestao({ simuladoId: SIM, cursinhoId: 'cur-1' });

    for (const e of aggregate.mock.calls[0][0]) {
      if (e.$unwind) {
        expect(e.$unwind.preserveNullAndEmptyArrays).toBeFalsy();
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.spec.ts`
Expected: FAIL — `repo.agregarPorQuestao is not a function`

- [ ] **Step 3: Write the implementation**

Em `relatorio-simulado-estudante.repository.ts`, acrescente o import do enum no topo:

```ts
import { Alternativa } from '../questao/enums/alternativa.enum';
```

e o tipo + o método depois de `contarDoCursinho`:

```ts
export interface AgregadoDaQuestao {
  questaoId: string;
  respondentes: number;
  acertos: number;
  erros: number;
  semLeitura: number;
  porAlternativa: Record<string, number>;
}
```

```ts
  /**
   * Acertos, erros e distribuição por alternativa, por questão, dentro do recorte.
   *
   * A resposta em branco chega com a chave `alternativaEstudante` AUSENTE — não
   * `null`, não `""` (o `processAnswer` emite uma linha por questão do simulado e
   * deixa o campo indefinido quando o aluno não marcou). Daí o `$ifNull`.
   *
   * ⚠️ `acertos`, `erros` e `semLeitura` são contados INDEPENDENTES, não derivados
   * um do outro. Derivar `erros = respondentes - acertos - semLeitura` tornaria a
   * invariante verdadeira por construção e o teste que a afirma, vazio.
   */
  async agregarPorQuestao(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<AgregadoDaQuestao[]> {
    const match: Record<string, unknown> = {
      simulado: new Types.ObjectId(params.simuladoId),
      cursinhoId: params.cursinhoId,
    };
    // mesma armadilha do card 02: `{turmaId: undefined}` vira `{turmaId: null}`
    if (params.turmaId !== undefined) {
      match.turmaId = params.turmaId;
    }

    const marcada = { $ifNull: ['$h.respostas.alternativaEstudante', null] };
    const porAlternativa = Object.fromEntries(
      Object.values(Alternativa).map((alt) => [
        alt,
        { $sum: { $cond: [{ $eq: [marcada, alt] }, 1, 0] } },
      ]),
    );

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
        // sem `preserveNullAndEmptyArrays`: um histórico failed não tem
        // `respostas` e NÃO pode virar respondente de todas as questões
        { $unwind: '$h' },
        { $unwind: '$h.respostas' },
        {
          $group: {
            _id: '$h.respostas.questao',
            respondentes: { $sum: 1 },
            acertos: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [marcada, null] },
                      {
                        $eq: [
                          '$h.respostas.alternativaEstudante',
                          '$h.respostas.alternativaCorreta',
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            erros: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [marcada, null] },
                      {
                        $ne: [
                          '$h.respostas.alternativaEstudante',
                          '$h.respostas.alternativaCorreta',
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            semLeitura: {
              $sum: { $cond: [{ $eq: [marcada, null] }, 1, 0] },
            },
            ...porAlternativa,
          },
        },
      ])
      .exec();

    return linhas.map((l: any) => ({
      questaoId: l._id?.toString(),
      respondentes: l.respondentes,
      acertos: l.acertos,
      erros: l.erros,
      semLeitura: l.semLeitura,
      porAlternativa: Object.fromEntries(
        Object.values(Alternativa).map((alt) => [alt, l[alt] ?? 0]),
      ),
    }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.spec.ts
git commit -m "feat: agregação por questão sobre o recorte do cursinho"
```

---

## Task 3: O serviço aplica o número e ordena

**Files:**
- Create: `src/modules/relatorio-simulado-estudante/dtos/questoes-do-relatorio.dto.output.ts`
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts`, `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescente a `relatorio-simulado-estudante.service.spec.ts`:

```ts
describe('RelatorioSimuladoEstudanteService.consultarQuestoes', () => {
  const agregado = (over: any = {}) => ({
    questaoId: 'q1',
    respondentes: 10,
    acertos: 6,
    erros: 3,
    semLeitura: 1,
    porAlternativa: { A: 6, B: 2, C: 1, D: 0, E: 0 },
    ...over,
  });

  const montarQ = (agregados: any[], numeros: any[]) => {
    const repository = {
      agregarPorQuestao: jest.fn().mockResolvedValue(agregados),
    };
    const simuladoRepository = {
      getNumerosDasQuestoes: jest.fn().mockResolvedValue(numeros),
    };
    return {
      svc: new RelatorioSimuladoEstudanteService(
        repository as any,
        simuladoRepository as any,
      ),
      repository,
      simuladoRepository,
    };
  };

  it('põe o número da questão, que não está na resposta', async () => {
    const { svc } = montarQ(
      [agregado()],
      [{ questaoId: 'q1', numero: 5 }],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes[0]).toEqual({
      numero: 5,
      questaoId: 'q1',
      respondentes: 10,
      acertos: 6,
      erros: 3,
      semLeitura: 1,
      porAlternativa: { A: 6, B: 2, C: 1, D: 0, E: 0 },
    });
  });

  it('ordena por número — é como o professor lê', async () => {
    const { svc } = montarQ(
      [agregado({ questaoId: 'q9' }), agregado({ questaoId: 'q1' })],
      [
        { questaoId: 'q9', numero: 9 },
        { questaoId: 'q1', numero: 1 },
      ],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes.map((q) => q.numero)).toEqual([1, 9]);
  });

  it('questão sem número vai para o fim, não some nem quebra', async () => {
    const { svc } = montarQ(
      [agregado({ questaoId: 'q-sem' }), agregado({ questaoId: 'q1' })],
      [
        { questaoId: 'q-sem', numero: null },
        { questaoId: 'q1', numero: 3 },
      ],
    );

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes.map((q) => q.numero)).toEqual([3, null]);
  });

  it('repassa o recorte, incluindo a turma', async () => {
    const { svc, repository, simuladoRepository } = montarQ([], []);

    await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });

    expect(repository.agregarPorQuestao).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-9',
    });
    expect(simuladoRepository.getNumerosDasQuestoes).toHaveBeenCalledWith(SIM);
  });

  it('recorte sem cartão nenhum devolve lista vazia, não erro', async () => {
    const { svc } = montarQ([], [{ questaoId: 'q1', numero: 1 }]);

    const r = await svc.consultarQuestoes({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
    });

    expect(r.questoes).toEqual([]);
  });
});
```

⚠️ O construtor de `RelatorioSimuladoEstudanteService` passa a receber **dois** argumentos. Ajuste
o helper `montar` que já existe no arquivo para passar `{} as any` como segundo.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`
Expected: FAIL — `svc.consultarQuestoes is not a function`

- [ ] **Step 3: Write the implementation**

Criar `src/modules/relatorio-simulado-estudante/dtos/questoes-do-relatorio.dto.output.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class QuestaoDoRelatorioDtoOutput {
  /**
   * Nulo quando a questão está vinculada à prova sem posição definida. Na
   * prática um simulado com questão sem número não é liberado, mas a leitura
   * não presume: a questão vai para o fim da lista em vez de sumir.
   */
  @ApiProperty({ required: false, nullable: true })
  numero: number | null;

  @ApiProperty() questaoId: string;

  @ApiProperty() respondentes: number;

  @ApiProperty() acertos: number;

  @ApiProperty() erros: number;

  /**
   * NÃO é "em branco". O ms-omr descarta tanto a questão não marcada quanto a
   * dupla marcação, e as duas chegam indistinguíveis — chamar de "em branco"
   * afirmaria o que ninguém verificou, e é o número que o professor usa para
   * decidir o que revisar em aula.
   */
  @ApiProperty() semLeitura: number;

  /**
   * Contagem por alternativa A–E. Contagem, não percentual: percentual
   * arredondado soma 99% ou 101%, e a tela divide melhor do que o ms adivinha.
   */
  @ApiProperty({ type: Object })
  porAlternativa: Record<string, number>;
}

export class QuestoesDoRelatorioDtoOutput {
  @ApiProperty({ type: [QuestaoDoRelatorioDtoOutput] })
  questoes: QuestaoDoRelatorioDtoOutput[];
}
```

Em `relatorio-simulado-estudante.service.ts`, acrescente os imports:

```ts
import { SimuladoRepository } from '../simulado/simulado.repository';
import {
  QuestaoDoRelatorioDtoOutput,
  QuestoesDoRelatorioDtoOutput,
} from './dtos/questoes-do-relatorio.dto.output';
```

Acrescente o segundo argumento do construtor:

```ts
    private readonly simuladoRepository: SimuladoRepository,
```

E o método:

```ts
  async consultarQuestoes(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<QuestoesDoRelatorioDtoOutput> {
    const [agregados, numeros] = await Promise.all([
      this.repository.agregarPorQuestao(params),
      this.simuladoRepository.getNumerosDasQuestoes(params.simuladoId),
    ]);

    const numeroPorQuestao = new Map(
      numeros.map((n) => [n.questaoId, n.numero]),
    );

    const questoes: QuestaoDoRelatorioDtoOutput[] = agregados.map((a) => ({
      numero: numeroPorQuestao.get(a.questaoId) ?? null,
      questaoId: a.questaoId,
      respondentes: a.respondentes,
      acertos: a.acertos,
      erros: a.erros,
      semLeitura: a.semLeitura,
      porAlternativa: a.porAlternativa,
    }));

    // Questão sem número vai para o fim: some da ordenação seria pior que
    // aparecer fora de ordem, porque o professor não saberia que ela existe.
    questoes.sort((a, b) => {
      if (a.numero === null) return 1;
      if (b.numero === null) return -1;
      return a.numero - b.numero;
    });

    return { questoes };
  }
```

Em `relatorio-simulado-estudante.module.ts`, importe o `SimuladoModule`:

```ts
import { SimuladoModule } from '../simulado/simulado.module';
```

e acrescente-o ao array `imports`.

⚠️ Isso segue o precedente do `CartaoRespostaModule` e não cria ciclo — o `simulado.module.spec.ts`
garante que o `SimuladoModule` não importa o módulo do relatório.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Build, para pegar o módulo mal fiado**

Run: `yarn build`
Expected: limpo. ⚠️ Teste de unidade constrói o serviço à mão e passa mesmo com o módulo quebrado.

- [ ] **Step 6: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/dtos/questoes-do-relatorio.dto.output.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.module.ts
git commit -m "feat: serviço do agregado por questão aplica o número e ordena"
```

---

## Task 4: A rota

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescente a `relatorio-simulado-estudante.controller.spec.ts`:

```ts
describe('RelatorioSimuladoEstudanteController.consultarQuestoes', () => {
  const montarQ = () => {
    const service = {
      consultarQuestoes: jest.fn().mockResolvedValue({ questoes: [] }),
    };
    return {
      ctrl: new RelatorioSimuladoEstudanteController(service as any),
      service,
    };
  };

  it('repassa simulado, cursinho e turma', async () => {
    const { ctrl, service } = montarQ();

    await ctrl.consultarQuestoes(SIM, {
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    } as any);

    expect(service.consultarQuestoes).toHaveBeenCalledWith({
      simuladoId: SIM,
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
  });

  it('recusa :simuladoId que não é ObjectId — 400, não 500', async () => {
    const { ctrl, service } = montarQ();

    await expect(
      ctrl.consultarQuestoes('nao-e-objectid', { cursinhoId: 'cur-1' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(service.consultarQuestoes).not.toHaveBeenCalled();
  });
});
```

Acrescente `import { BadRequestException } from '@nestjs/common';` no topo do arquivo de teste se
ainda não estiver lá.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts`
Expected: FAIL — `ctrl.consultarQuestoes is not a function`

- [ ] **Step 3: Write the implementation**

No controller, acrescente o import do DTO de saída:

```ts
import { QuestoesDoRelatorioDtoOutput } from './dtos/questoes-do-relatorio.dto.output';
```

e o método **antes** do `@Get(':simuladoId')` que já existe:

```ts
  @Get(':simuladoId/questoes')
  @ApiResponse({
    status: 200,
    description: 'agregado por questão no recorte do cursinho (ou da turma)',
    type: QuestoesDoRelatorioDtoOutput,
  })
  async consultarQuestoes(
    @Param('simuladoId') simuladoId: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<QuestoesDoRelatorioDtoOutput> {
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultarQuestoes({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }
```

⚠️ **A ordem importa.** `@Get(':simuladoId')` casaria `…/questoes` tratando `questoes` como um id se
viesse primeiro. Declarar a rota mais específica antes é o que evita a colisão — o mesmo tipo de
armadilha registrada no `caderno.controller.ts` deste repo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts \
        src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts
git commit -m "feat: rota GET /v1/relatorio-simulado/:simuladoId/questoes"
```

---

## Task 5: O teste contra Mongo real

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`

A agregação é a parte que dublê nenhum prova: os testes da Task 2 verificam que o pipeline é
**montado** como se espera, não que o Mongo **conta** certo. O arquivo de isolamento já boota um
Mongo real e um app Nest — estenda-o.

- [ ] **Step 1: Write the test**

Leia o arquivo inteiro primeiro para reusar o `beforeAll`, o `semear` e o app HTTP que já existem.

Acrescente ao `semear` (ou crie um helper irmão) a capacidade de gravar `respostas` e um `status`,
já que hoje ele só cria históricos `completed` sem respostas. Depois acrescente este bloco:

```ts
describe('agregado por questão (Mongo real)', () => {
  // Três estudantes do cur-1 em SIM_C: q1 → 2 acertos e 1 sem leitura;
  // q2 → 1 acerto, 1 erro, 1 sem leitura. Mais um histórico FAILED, que não vota.
  const SIM_C = new Types.ObjectId();
  const Q1 = new Types.ObjectId();
  const Q2 = new Types.ObjectId();

  beforeAll(async () => {
    const comRespostas = async (
      usuario: string,
      cursinhoId: string,
      respostas: any[],
      status = 'completed',
    ) => {
      const h = await histModel.create({
        usuario,
        simulado: SIM_C,
        status,
        respostas,
      });
      await relModel.create({
        historico: h._id,
        simulado: SIM_C,
        usuario,
        cursinhoId,
      });
    };

    await comRespostas('u-1', 'cur-1', [
      { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
      { questao: Q2, alternativaEstudante: 'B', alternativaCorreta: 'B' },
    ]);
    await comRespostas('u-2', 'cur-1', [
      { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
      { questao: Q2, alternativaEstudante: 'C', alternativaCorreta: 'B' },
    ]);
    // em branco: a chave `alternativaEstudante` simplesmente não existe
    await comRespostas('u-3', 'cur-1', [
      { questao: Q1, alternativaCorreta: 'A' },
      { questao: Q2, alternativaCorreta: 'B' },
    ]);
    // outro cursinho, não pode entrar na conta
    await comRespostas('u-4', 'cur-2', [
      { questao: Q1, alternativaEstudante: 'E', alternativaCorreta: 'A' },
    ]);
    // failed: sem `respostas`, não vota em questão nenhuma
    await comRespostas('u-5', 'cur-1', undefined as any, 'failed');
  }, 120_000);

  it('conta acertos, erros e sem-leitura por questão', async () => {
    const r = await repo.agregarPorQuestao({
      simuladoId: SIM_C.toString(),
      cursinhoId: 'cur-1',
    });
    const q1 = r.find((q) => q.questaoId === Q1.toString())!;
    const q2 = r.find((q) => q.questaoId === Q2.toString())!;

    expect(q1).toMatchObject({ respondentes: 3, acertos: 2, erros: 0, semLeitura: 1 });
    expect(q2).toMatchObject({ respondentes: 3, acertos: 1, erros: 1, semLeitura: 1 });
  });

  it('acertos + erros + semLeitura === respondentes, em toda questão', async () => {
    // a invariante que pega um $cond errado — por isso os três são contados
    // independentes, e não um derivado dos outros
    const r = await repo.agregarPorQuestao({
      simuladoId: SIM_C.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r).toHaveLength(2);
    for (const q of r) {
      expect(q.acertos + q.erros + q.semLeitura).toBe(q.respondentes);
    }
  });

  it('a distribuição por alternativa bate, e cobre A–E', async () => {
    const r = await repo.agregarPorQuestao({
      simuladoId: SIM_C.toString(),
      cursinhoId: 'cur-1',
    });
    const q2 = r.find((q) => q.questaoId === Q2.toString())!;
    expect(q2.porAlternativa).toEqual({ A: 0, B: 1, C: 1, D: 0, E: 0 });
  });

  it('histórico failed não vira respondente de nada', async () => {
    // com preserveNullAndEmptyArrays no $unwind, u-5 apareceria em toda questão
    const r = await repo.agregarPorQuestao({
      simuladoId: SIM_C.toString(),
      cursinhoId: 'cur-1',
    });
    for (const q of r) {
      expect(q.respondentes).toBe(3); // u-1, u-2, u-3 — nunca 4
    }
  });

  it('não vaza entre cursinhos', async () => {
    // u-4 marcou E em Q1 pelo cur-2; não pode aparecer na conta do cur-1
    const r = await repo.agregarPorQuestao({
      simuladoId: SIM_C.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.find((q) => q.questaoId === Q1.toString())!.porAlternativa.E).toBe(0);
  });

  it('recorte sem cartão devolve lista vazia, não erro', async () => {
    const r = await repo.agregarPorQuestao({
      simuladoId: new Types.ObjectId().toString(),
      cursinhoId: 'cur-1',
    });
    expect(r).toEqual([]);
  });
});
```

Acrescente também, no bloco HTTP que já existe no arquivo, um caso para a rota nova:

```ts
  it('GET :simuladoId/questoes responde 200 com o agregado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/relatorio-simulado/${SIM_C.toString()}/questoes`)
      .query({ cursinhoId: 'cur-1' })
      .expect(200);

    // prova que a rota específica não foi engolida por `@Get(':simuladoId')`
    expect(Array.isArray(res.body.questoes)).toBe(true);
  });
```

⚠️ Se `SIM_C` estiver declarado dentro do `describe` novo e o bloco HTTP estiver fora dele, mova a
constante para o escopo do arquivo. **Não duplique a semeadura.**

- [ ] **Step 2: Run it**

Run: `npx jest src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`
Expected: PASS

⚠️ Se algum caso falhar, **não ajuste a asserção** — é este teste que justifica o card. Investigue a
agregação e relate.

- [ ] **Step 3: Provar que discrimina**

Temporariamente acrescente `preserveNullAndEmptyArrays: true` ao `$unwind` de `'$h.respostas'`,
confirme que o teste do histórico failed fica **vermelho**, reverta e confirme `git status` limpo.
Relate o que viu.

- [ ] **Step 4: Suíte inteira e build**

```bash
yarn test
yarn build
```

Expected: verde, sem aviso de open handle.

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts
git commit -m "test: agregado por questão contra Mongo real"
```

---

## Verificação final

- [ ] `yarn test` verde · `yarn build` limpo · `npx eslint` nos arquivos tocados sem achados novos
- [ ] `git status` sem arquivo alheio
- [ ] `GET /v1/relatorio-simulado/:id/questoes` não é engolida por `@Get(':simuladoId')` — provado
      pelo teste HTTP

## O que vem depois

- **Card `04`** orquestra na api: resolve o cursinho pelo JWT, hidrata nome e matrícula, e consome
  tanto esta rota quanto a do card `02`.
- **Cards `05`/`06`** montam a aba de questões a partir daqui — e são elas que dividem para exibir
  percentual, que este card deliberadamente não calcula.
- **Card novo no ms-omr:** distinguir questão em branco de dupla marcação. Muda o rótulo
  `semLeitura`, não o cálculo.
