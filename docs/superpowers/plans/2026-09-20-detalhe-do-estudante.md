# O detalhe do estudante — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar na linha de um estudante no relatório do simulado e ver, questão a questão, o que ele marcou, o que era correto, e se acertou, errou ou ficou sem leitura.

**Architecture:** Uma rota nova no ms que lê a junção por `{simulado, cursinhoId, usuario}` — o índice único, que **é** o gate de cursinho — e devolve as respostas já classificadas; um proxy fino na api sob a permissão do card `04`; e um modal sobre o relatório no client.

**Tech Stack:** NestJS 10 + Mongoose (ms), NestJS 10 (api), React 19 + Vite (client), Jest, Vitest, `mongodb-memory-server`, supertest.

**Spec:** `docs/superpowers/specs/2026-09-20-detalhe-do-estudante-design.md`

**Branches:** `feature/07-detalhe-do-estudante` nos três repos, todas saindo de `develop`.

---

## ⚠️ Conflito previsto com o card `04b`

O `04b` (ms **#195**, api **#552**) ainda está **aberto** e mexe nos mesmos arquivos: o controller do relatório e o spec de isolamento nos dois backends. Este card sai de uma `develop` que **não** tem a rota `simulados`.

Não é problema de correção — a rota nova aqui tem dois segmentos (`:simuladoId/estudante/:usuario`) e a do `04b` tem um (`simulados`), então não colidem. É problema de **merge**: quem entrar depois resolve conflito de texto nos dois arquivos. Esperado; não tente evitar.

---

## Estrutura de arquivos

### ms-simulado

| arquivo | responsabilidade |
|---|---|
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts` | +`buscarDetalheDoEstudante` |
| `src/modules/relatorio-simulado-estudante/dtos/detalhe-do-estudante.dto.output.ts` | **novo** — o DTO e o enum de resultado |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts` | +`consultarDetalhe` (junta número, classifica, 404) |
| `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts` | +rota |

### api-vcnafacul

| arquivo | responsabilidade |
|---|---|
| `src/modules/simulado/relatorio/relatorio-http.service.ts` | +`buscarDetalheDoEstudante` |
| `src/modules/simulado/relatorio/dtos/detalhe-do-estudante.dto.output.ts` | **novo** — espelho |
| `src/modules/simulado/relatorio/relatorio.service.ts` | +`consultarDetalhe` |
| `src/modules/simulado/relatorio/relatorio.controller.ts` | +rota |

### client-vcnafacul

| arquivo | responsabilidade |
|---|---|
| `src/dtos/relatorioSimulado/relatorioSimulado.ts` | +os tipos do detalhe |
| `src/services/relatorioSimulado/buscarDetalheDoEstudante.ts` | **novo** |
| `src/pages/relatorioSimulado/DetalheDoEstudante.tsx` | **novo** — o modal |
| `src/pages/relatorioSimulado/index.tsx` | +`onRowClick` e o modal |

---

## ⚠️ Regras da casa

- **ms:** `npx jest --detectOpenHandles --forceExit <caminho>`. ⚠️ **NUNCA `yarn lint`** — reformata o repo; use `npx eslint <caminho>`.
- **api:** `npx jest <caminho>`. ⚠️ **NUNCA `npm test`** — sobe Docker MySQL e a e2e inteira. Build: `npm run build`.
- **client:** `npx vitest run <caminho>`. ⚠️ `npm run lint` está quebrado — use `ESLINT_USE_FLAT_CONFIG=false npx eslint <caminhos>`. ⚠️ **`@testing-library/user-event` NÃO está instalado** — `fireEvent`. ⚠️ **`npx tsc --noEmit -p tsconfig.app.json` não checa nada em `src/`** (aquele tsconfig inclui só o `vite.config.ts`) — o typecheck de verdade é `npm run build`.
- Commitar **adicionando por nome**.

---

## Task 1: A leitura, contra Mongo de verdade

⚠️ **O gate é o filtro.** A junção tem índice **único** em `{simulado, cursinhoId, usuario}`. Buscar pelos três é uma leitura indexada que já não encontra nada para estudante de outro cursinho — não há checagem separada que alguém possa esquecer, nem caminho em que o dado alheio entra no processo antes de ser recusado.

⚠️ **E aqui as `respostas` ENTRAM na projeção**, ao contrário do `CAMPOS_DO_HISTORICO` usado pelo relatório. É um estudante, não centenas: a razão que excluiu o campo lá não vale aqui.

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`

- [ ] **Step 1: Ler o bloco vizinho** para reusar `relModel`, `histModel` e `repo`

Run: `sed -n '200,260p' src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`

⚠️ **Não crie arquivo de spec novo** — outro `MongoMemoryServer` custa dezenas de segundos. Acrescente um `describe` irmão dentro do `describe` externo.

- [ ] **Step 2: Escrever o teste que falha**

```ts
  describe('buscarDetalheDoEstudante (Mongo real)', () => {
    const SIM_D = new Types.ObjectId();
    const Q1 = new Types.ObjectId();
    const Q2 = new Types.ObjectId();
    const Q3 = new Types.ObjectId();

    beforeAll(async () => {
      const h = await histModel.create({
        usuario: 'u-det',
        simulado: SIM_D,
        status: 'completed',
        respostas: [
          { questao: Q1, alternativaEstudante: 'A', alternativaCorreta: 'A' },
          { questao: Q2, alternativaEstudante: 'B', alternativaCorreta: 'C' },
          // ⚠️ sem `alternativaEstudante`: é assim que "sem leitura" chega —
          // a CHAVE não existe. Não é null, não é string vazia. Medido no 03.
          { questao: Q3, alternativaCorreta: 'D' },
        ],
      });
      await relModel.create({
        historico: h._id,
        simulado: SIM_D,
        usuario: 'u-det',
        cursinhoId: 'cur-det',
        turmaId: 't-det',
      });
    }, 120_000);

    it('devolve as respostas do estudante, com o gabarito junto', async () => {
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-det',
      });

      expect(r!.historico!.respostas).toHaveLength(3);
      expect(r!.historico!.respostas[0].alternativaCorreta).toBe('A');
    });

    it('⚠️ estudante de OUTRO cursinho não é encontrado — o filtro é o gate', async () => {
      // não há checagem separada a esquecer: a leitura indexada já não acha
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-alheio',
        usuario: 'u-det',
      });

      expect(r).toBeNull();
    });

    it('usuário que não está no recorte devolve null', async () => {
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-que-nao-existe',
      });

      expect(r).toBeNull();
    });

    it('⚠️ a resposta sem leitura NÃO tem a chave alternativaEstudante', async () => {
      // é o que distingue "não marcou / OMR não leu" de "marcou errado", e a
      // classificação do serviço depende disso
      const r = await repo.buscarDetalheDoEstudante({
        simuladoId: SIM_D.toString(),
        cursinhoId: 'cur-det',
        usuario: 'u-det',
      });

      const semLeitura = r!.historico!.respostas[2];
      expect(semLeitura.alternativaEstudante).toBeUndefined();
      expect(semLeitura.alternativaCorreta).toBe('D');
    });
  });
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts`
Expected: FAIL — `repo.buscarDetalheDoEstudante is not a function`.

- [ ] **Step 4: Implementar**

Perto do `CAMPOS_DO_HISTORICO`, no topo do repositório:

```ts
/**
 * ⚠️ O oposto do `CAMPOS_DO_HISTORICO`: aqui as `respostas` ENTRAM. Lá elas
 * ficam de fora porque o relatório lê centenas de linhas e nenhuma tela usa o
 * detalhe; aqui é UM estudante, e o detalhe é exatamente o que se pediu.
 */
const CAMPOS_DO_DETALHE = 'status falha respostas';
```

E o método, no fim da classe:

```ts
  /**
   * O detalhe de UM estudante no recorte.
   *
   * ⚠️ **O filtro é o gate.** O índice único desta coleção é
   * `{simulado, cursinhoId, usuario}` — buscar pelos três é uma leitura
   * indexada que **já não encontra** estudante de outro cursinho. Não existe
   * checagem separada que alguém possa esquecer de escrever, nem um caminho em
   * que as respostas alheias entram no processo antes de serem recusadas.
   *
   * `historico` pode vir `null` (ref apagada depois do vínculo) — quem consome
   * trata, como no `buscarPorRecorte`.
   */
  async buscarDetalheDoEstudante(params: {
    simuladoId: string;
    cursinhoId: string;
    usuario: string;
  }): Promise<LinhaComHistorico | null> {
    return this.model
      .findOne({
        simulado: new Types.ObjectId(params.simuladoId),
        cursinhoId: params.cursinhoId,
        usuario: params.usuario,
      })
      .populate({ path: 'historico', select: CAMPOS_DO_DETALHE })
      .lean()
      .exec() as unknown as Promise<LinhaComHistorico | null>;
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: PASS, e os blocos que já existiam continuam verdes.

- [ ] **Step 6: Provar que o teste discrimina**

Tire `cursinhoId: params.cursinhoId` do filtro. O teste `estudante de OUTRO cursinho não é encontrado` tem que **falhar**. Restaure e confirme verde. Reporte o que viu — é o gate inteiro.

- [ ] **Step 7: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.repository.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts
git commit -m "feat: leitura do detalhe de um estudante no recorte"
```

---

## Task 2: O DTO e a classificação

⚠️ **Quem classifica é o ms, não a tela.** A regra de "sem leitura" é a ausência da **chave**
`alternativaEstudante` — sutil, medida em BSON real, e é o número que o professor usa para decidir o
que revisar. Deixar o client re-derivar isso é pedir que duas implementações da mesma regra
divirjam. Mesmo motivo pelo qual o card `01` derivou a descrição da falha no servidor.

**Files:**
- Create: `src/modules/relatorio-simulado-estudante/dtos/detalhe-do-estudante.dto.output.ts`
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente um `describe` novo no fim do spec da service, com helper próprio (os outros blocos têm os seus; não reaproveite nem altere):

```ts
describe('RelatorioSimuladoEstudanteService.consultarDetalhe', () => {
  const montarDetalhe = (over?: { linha?: any; numeros?: any[] }) => {
    const repository = {
      buscarDetalheDoEstudante: jest
        .fn()
        .mockResolvedValue(over?.linha ?? null),
    };
    const simuladoRepository = {
      getNumerosDasQuestoes: jest.fn().mockResolvedValue(over?.numeros ?? []),
    };
    const svc = new RelatorioSimuladoEstudanteService(
      repository as any,
      simuladoRepository as any,
    );
    return { svc, repository, simuladoRepository };
  };

  const comRespostas = (respostas: any[], over: any = {}) => ({
    usuario: 'u1',
    historico: { status: 'completed', respostas, ...over },
  });

  it('classifica acerto, erro e sem leitura', async () => {
    const { svc } = montarDetalhe({
      linha: comRespostas([
        { questao: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A' },
        { questao: 'q2', alternativaEstudante: 'B', alternativaCorreta: 'C' },
        { questao: 'q3', alternativaCorreta: 'D' },
      ]),
      numeros: [
        { questaoId: 'q1', numero: 1 },
        { questaoId: 'q2', numero: 2 },
        { questaoId: 'q3', numero: 3 },
      ],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: 's1',
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas.map((x) => x.resultado)).toEqual([
      'acerto',
      'erro',
      'sem_leitura',
    ]);
  });

  it('⚠️ sem leitura é a AUSÊNCIA da chave, não uma alternativa vazia', async () => {
    // se alguém trocar por `=== null` ou `=== ''`, a questão não marcada passa
    // a contar como erro e o professor revisa a aula errada
    const { svc } = montarDetalhe({
      linha: comRespostas([{ questao: 'q1', alternativaCorreta: 'D' }]),
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: 's1',
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas[0].resultado).toBe('sem_leitura');
    expect(r.respostas[0].alternativaEstudante).toBeUndefined();
  });

  it('junta o número vindo do simulado', async () => {
    const { svc } = montarDetalhe({
      linha: comRespostas([
        { questao: 'q7', alternativaEstudante: 'A', alternativaCorreta: 'A' },
      ]),
      numeros: [{ questaoId: 'q7', numero: 7 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: 's1',
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas[0].numero).toBe(7);
  });

  it('questão sem número vai para o FIM, não some', async () => {
    const { svc } = montarDetalhe({
      linha: comRespostas([
        { questao: 'q-sem', alternativaEstudante: 'A', alternativaCorreta: 'A' },
        { questao: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A' },
      ]),
      numeros: [{ questaoId: 'q1', numero: 1 }],
    });

    const r = await svc.consultarDetalhe({
      simuladoId: 's1',
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.respostas.map((x) => x.numero)).toEqual([1, null]);
  });

  it('linha inexistente vira NotFoundException, não lista vazia', async () => {
    // a tela pediu UM estudante; devolver vazio diria "ele não respondeu nada",
    // que é outra coisa
    const { svc } = montarDetalhe({ linha: null });

    await expect(
      svc.consultarDetalhe({ simuladoId: 's1', cursinhoId: 'cur-1', usuario: 'u1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('histórico falho devolve a falha DESCRITA e nenhuma resposta', async () => {
    const { svc } = montarDetalhe({
      linha: {
        usuario: 'u1',
        historico: {
          status: 'failed',
          respostas: [],
          falha: { codigo: 'cartao_nao_detectado' },
        },
      },
    });

    const r = await svc.consultarDetalhe({
      simuladoId: 's1',
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.falha).toEqual(
      expect.objectContaining({ descricao: expect.any(String) }),
    );
    expect(r.respostas).toHaveLength(0);
  });

  it('⚠️ completed que ainda carrega falha antiga NÃO devolve a falha', async () => {
    // `marcarFalha` é o único escritor de `falha` e nada nunca a desfaz — o
    // `completeProcessing` não toca nela. Sem este gate a tela diria "lido" e
    // mostraria o motivo do erro ao lado.
    const { svc } = montarDetalhe({
      linha: comRespostas([], {
        status: 'completed',
        falha: { codigo: 'cartao_nao_detectado' },
      }),
    });

    const r = await svc.consultarDetalhe({
      simuladoId: 's1',
      cursinhoId: 'cur-1',
      usuario: 'u1',
    });

    expect(r.falha).toBeUndefined();
  });

  it('linha órfã (histórico apagado) vira NotFoundException', async () => {
    const { svc } = montarDetalhe({ linha: { usuario: 'u1', historico: null } });

    await expect(
      svc.consultarDetalhe({ simuladoId: 's1', cursinhoId: 'cur-1', usuario: 'u1' }),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts`
Expected: FAIL — `svc.consultarDetalhe` não existe.

- [ ] **Step 3: Criar o DTO**

`src/modules/relatorio-simulado-estudante/dtos/detalhe-do-estudante.dto.output.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { FalhaDescrita } from '../../historico/falha/mapa-falha';

/**
 * ⚠️ **Três estados, não dois.** Juntar "não marcou" com "marcou errado"
 * distorce exatamente a leitura que o professor faz para decidir o que revisar
 * em aula.
 *
 * ⚠️ E é `sem_leitura`, não `em_branco`: o `cartao_reader.py` do ms-omr só
 * emite questão cuja leitura é UMA letra A–E, descartando `""` e `"AE"`
 * igualmente. Branco e dupla marcação chegam indistinguíveis — chamar de
 * "em branco" afirma o que ninguém verificou.
 */
export enum ResultadoDaQuestao {
  Acerto = 'acerto',
  Erro = 'erro',
  SemLeitura = 'sem_leitura',
}

export class RespostaDoEstudanteDtoOutput {
  /** `null` quando a questão está no simulado sem posição. Vai para o fim. */
  @ApiProperty({ required: true, nullable: true })
  numero: number | null;

  @ApiProperty()
  questaoId: string;

  /** AUSENTE quando não houve leitura — não vazio, não nulo. */
  @ApiProperty({ required: false, enum: Alternativa })
  alternativaEstudante?: Alternativa;

  @ApiProperty({ required: false, enum: Alternativa })
  alternativaCorreta?: Alternativa;

  @ApiProperty({ enum: ResultadoDaQuestao })
  resultado: ResultadoDaQuestao;
}

export class DetalheDoEstudanteDtoOutput {
  @ApiProperty({ enum: HistoricoStatus })
  status: HistoricoStatus;

  /** Só quando `status === 'failed'` — ver o serviço. */
  @ApiProperty({ required: false })
  falha?: FalhaDescrita;

  @ApiProperty({ type: [RespostaDoEstudanteDtoOutput] })
  respostas: RespostaDoEstudanteDtoOutput[];
}
```

- [ ] **Step 4: Implementar o serviço**

Importe `NotFoundException` de `@nestjs/common` e o DTO. Acrescente no fim da classe:

```ts
  async consultarDetalhe(params: {
    simuladoId: string;
    cursinhoId: string;
    usuario: string;
  }): Promise<DetalheDoEstudanteDtoOutput> {
    const linha = await this.repository.buscarDetalheDoEstudante(params);

    // ⚠️ 404, não lista vazia: a tela pediu UM estudante. Vazio diria "ele não
    // respondeu nada", que é outra coisa. E a linha órfã (histórico apagado
    // depois do vínculo) cai aqui pelo mesmo motivo.
    if (!linha?.historico) {
      throw new NotFoundException(
        `estudante ${params.usuario} não tem cartão neste simulado`,
      );
    }

    const h = linha.historico;
    const numeros = await this.simuladoRepository.getNumerosDasQuestoes(
      params.simuladoId,
    );
    const numeroPorQuestao = new Map(numeros.map((n) => [n.questaoId, n.numero]));

    const respostas = (h.respostas ?? []).map((r: any) => {
      const questaoId = r.questao?.toString();
      // ⚠️ AUSÊNCIA da chave. Trocar por `=== null` ou `=== ''` faz a questão
      // não marcada virar ERRO — e o professor revisa a aula errada.
      const marcada = r.alternativaEstudante;
      const resultado =
        marcada === undefined
          ? ResultadoDaQuestao.SemLeitura
          : marcada === r.alternativaCorreta
            ? ResultadoDaQuestao.Acerto
            : ResultadoDaQuestao.Erro;

      return {
        numero: numeroPorQuestao.get(questaoId) ?? null,
        questaoId,
        alternativaEstudante: marcada,
        alternativaCorreta: r.alternativaCorreta,
        resultado,
      };
    });

    // Questão sem número vai para o fim — sumir seria pior que aparecer fora
    // de ordem. Dois nulos empatam (0): devolver 1 nos dois sentidos não é uma
    // ordem total. Mesma regra do `consultarQuestoes`.
    respostas.sort((a, b) => {
      if (a.numero === null && b.numero === null) return 0;
      if (a.numero === null) return 1;
      if (b.numero === null) return -1;
      return a.numero - b.numero;
    });

    return {
      status: h.status,
      // ⚠️ Só em `failed`: `marcarFalha` é o único escritor de `falha` e nada
      // nunca a desfaz (o `completeProcessing` não toca nela), então um cartão
      // reprocessado carrega o motivo antigo. Mesma armadilha que o card 06
      // fechou na tela.
      falha:
        h.status === HistoricoStatus.Failed ? descreverFalha(h.falha) : undefined,
      respostas,
    };
  }
```

⚠️ `descreverFalha` e `HistoricoStatus` já estão importados no arquivo? **Confira** — o `HistoricoStatus` talvez não esteja. Importe o que faltar.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 6: Provar que dois testes discriminam**

**(a)** Troque `marcada === undefined` por `marcada === null`. O teste de "sem leitura é a AUSÊNCIA da chave" tem que falhar.
**(b)** Troque o gate da falha por `descreverFalha(h.falha)` sem condição. O teste de `completed` com falha residual tem que falhar.

Reverta os dois e confirme verde. Reporte o que viu.

- [ ] **Step 7: Commit**

```bash
git add src/modules/relatorio-simulado-estudante/dtos/detalhe-do-estudante.dto.output.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.ts src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.service.spec.ts
git commit -m "feat: classificacao das respostas do estudante no detalhe"
```

---

## Task 3: A rota do ms

**Files:**
- Modify: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.ts`
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.isolamento.spec.ts` (bloco HTTP)
- Test: `src/modules/relatorio-simulado-estudante/relatorio-simulado-estudante.controller.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

**(a)** No bloco `describe('HTTP: controller → service → repositório → Mongo', ...)`:

```ts
    it('GET :simuladoId/estudante/:usuario responde 200 com as respostas', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}/estudante/u-http-falha`)
        .query({ cursinhoId: 'cur-http' })
        .expect(200);

      expect(res.body.status).toBe('failed');
      expect(res.body.falha).toEqual(
        expect.objectContaining({ descricao: expect.any(String) }),
      );
    });

    it('⚠️ estudante de outro cursinho dá 404, não 200 com vazio', async () => {
      await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}/estudante/u-http-falha`)
        .query({ cursinhoId: 'cur-alheio' })
        .expect(404);
    });

    it('sem cursinhoId recusa com 400', async () => {
      await request(app.getHttpServer())
        .get(`/v1/relatorio-simulado/${SIM_HTTP.toString()}/estudante/u-http-falha`)
        .expect(400);
    });
```

**(b)** No `relatorio-simulado-estudante.controller.spec.ts`, acrescente `consultarDetalhe` ao dublê do `montar()` (aditivo) e:

```ts
  it('consultarDetalhe repassa simulado, usuário e cursinho', async () => {
    const { ctrl, service } = montar();

    await ctrl.consultarDetalhe(SIM, 'u1', { cursinhoId: 'cur-1' } as any);

    expect(service.consultarDetalhe).toHaveBeenCalledWith({
      simuladoId: SIM,
      usuario: 'u1',
      cursinhoId: 'cur-1',
    });
  });

  it('simuladoId inválido no detalhe dá 400, não 500', async () => {
    const { ctrl } = montar();

    await expect(
      ctrl.consultarDetalhe('nao-e-objectid', 'u1', { cursinhoId: 'cur-1' } as any),
    ).rejects.toThrow(BadRequestException);
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Importe o DTO e acrescente o handler **junto do `@Get(':simuladoId/questoes')`**, antes do `@Get(':simuladoId')`:

```ts
  @Get(':simuladoId/estudante/:usuario')
  @ApiResponse({
    status: 200,
    description: 'o que o estudante marcou e o que era correto',
    type: DetalheDoEstudanteDtoOutput,
  })
  @ApiResponse({
    status: 404,
    description: 'estudante não tem cartão neste simulado, ou é de outro cursinho',
  })
  async consultarDetalhe(
    @Param('simuladoId') simuladoId: string,
    @Param('usuario') usuario: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<DetalheDoEstudanteDtoOutput> {
    // Sem isto, `new Types.ObjectId(simuladoId)` lança BSONError e vira 500 —
    // erro do CHAMADOR virando 500 sem pista, como nas rotas vizinhas.
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultarDetalhe({
      simuladoId,
      usuario,
      cursinhoId: query.cursinhoId,
    });
  }
```

⚠️ **A rota tem dois segmentos**, como `:simuladoId/questoes` — não colide com ela (o segundo segmento é literal e diferente) nem com `:simuladoId` (um segmento). Mas o teste que sobe o app é o que prova isso; não confie no raciocínio.

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx jest --detectOpenHandles --forceExit src/modules/relatorio-simulado-estudante/`
Expected: PASS

- [ ] **Step 5: Build, lint e commit**

```bash
npm run build
npx eslint src/modules/relatorio-simulado-estudante
git add src/modules/relatorio-simulado-estudante/
git commit -m "feat: rota do detalhe do estudante no ms"
```

⚠️ **Não rode `yarn lint`.**

---

## Task 4: O proxy e a rota na api

**Repo:** `api-vcnafacul` — `cd ../api-vcnafacul`, branch `feature/07-detalhe-do-estudante` saindo de `develop`.

**Files:**
- Modify: `src/modules/simulado/relatorio/relatorio-http.service.ts`
- Create: `src/modules/simulado/relatorio/dtos/detalhe-do-estudante.dto.output.ts`
- Modify: `src/modules/simulado/relatorio/relatorio.service.ts`
- Modify: `src/modules/simulado/relatorio/relatorio.controller.ts`
- Test: `relatorio-http.service.spec.ts`, `relatorio.service.spec.ts`, `relatorio-rotas.controller.spec.ts`, `relatorio.controller.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

**(a)** Em `relatorio-http.service.spec.ts` (o `montar()` já devolve `{svc, axios}`):

```ts
  it('buscarDetalheDoEstudante monta a URL com o usuário no caminho', async () => {
    const { svc, axios } = montar();

    await svc.buscarDetalheDoEstudante('sim-1', 'u1', 'cur-1');

    expect(axios.get).toHaveBeenCalledWith(
      'v1/relatorio-simulado/sim-1/estudante/u1?cursinhoId=cur-1',
    );
  });
```

**(b)** Em `relatorio.service.spec.ts` — **amplie o `montar()` de forma aditiva** (ele já expõe `http` e `cursinhoResolver`): acrescente `buscarDetalheDoEstudante: jest.fn().mockResolvedValue(over.detalhe ?? { status: 'completed', respostas: [] })` ao dublê de `http`. Depois:

```ts
describe('RelatorioService.consultarDetalhe', () => {
  it('resolve o cursinho pelo JWT — nenhum parâmetro o troca', async () => {
    const { svc, http, cursinhoResolver } = montar();

    await svc.consultarDetalhe('colab-1', 'sim-1', 'u1');

    expect(cursinhoResolver.resolveCursinhoIdByUserId).toHaveBeenCalledWith('colab-1');
    expect(http.buscarDetalheDoEstudante).toHaveBeenCalledWith('sim-1', 'u1', 'cur-1');
  });

  it('devolve o que o ms mandou, sem reescrever', async () => {
    const detalhe = {
      status: 'completed',
      respostas: [
        { numero: 1, questaoId: 'q1', alternativaEstudante: 'A', alternativaCorreta: 'A', resultado: 'acerto' },
      ],
    };
    const { svc } = montar({ detalhe });

    await expect(svc.consultarDetalhe('colab-1', 'sim-1', 'u1')).resolves.toEqual(detalhe);
  });
});
```

⚠️ **Não passe turma aqui.** O detalhe é de um estudante identificado por `usuario`; o recorte de turma não acrescenta nada e o `cursinhoId` do JWT já é o gate.

**(c)** Em `relatorio-rotas.controller.spec.ts`, acrescente `consultarDetalhe: jest.fn()` ao dublê e ao `beforeEach`, e:

```ts
  it('GET :simuladoId/estudante/:userId resolve para o handler certo', async () => {
    await request(app.getHttpServer())
      .get('/mssimulado/relatorio/simulado/sim-1/estudante/u1')
      .expect(200);

    expect(service.consultarDetalhe).toHaveBeenCalledWith('colab-1', 'sim-1', 'u1');
    expect(service.consultar).not.toHaveBeenCalled();
    expect(service.consultarQuestoes).not.toHaveBeenCalled();
  });
```

**(d)** Em `relatorio.controller.spec.ts`, acrescente `'detalheDoEstudante'` à lista do `it.each` que fixa a permissão por handler.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx jest src/modules/simulado/relatorio`
Expected: FAIL.

- [ ] **Step 3: Implementar o http service**

Depois de `buscarSimulados` (ou do último método):

```ts
  async buscarDetalheDoEstudante(
    simuladoId: string,
    usuario: string,
    cursinhoId: string,
  ): Promise<unknown> {
    return this.axios.get(
      `v1/relatorio-simulado/${simuladoId}/estudante/${usuario}?${this.query(
        cursinhoId,
      )}`,
    );
  }
```

- [ ] **Step 4: Criar o DTO espelho**

`src/modules/simulado/relatorio/dtos/detalhe-do-estudante.dto.output.ts` — espelha o do ms. Redeclarado porque os repositórios são separados, a mesma razão do `QuestoesDoRelatorioDtoOutput`.

```ts
import { ApiProperty } from '@nestjs/swagger';

/** Espelha o `ResultadoDaQuestao` do ms-simulado. */
export type ResultadoDaQuestao = 'acerto' | 'erro' | 'sem_leitura';

export class RespostaDoEstudanteDtoOutput {
  @ApiProperty({ required: true, nullable: true })
  numero: number | null;

  @ApiProperty()
  questaoId: string;

  /** AUSENTE quando não houve leitura — não vazio, não nulo. */
  @ApiProperty({ required: false })
  alternativaEstudante?: string;

  @ApiProperty({ required: false })
  alternativaCorreta?: string;

  @ApiProperty({ enum: ['acerto', 'erro', 'sem_leitura'] })
  resultado: ResultadoDaQuestao;
}

export class DetalheDoEstudanteDtoOutput {
  @ApiProperty()
  status: string;

  /** Já descrita pelo ms — `descricao` e `acaoSugerida` prontas. */
  @ApiProperty({ required: false, type: Object })
  falha?: Record<string, unknown>;

  @ApiProperty({ type: [RespostaDoEstudanteDtoOutput] })
  respostas: RespostaDoEstudanteDtoOutput[];
}
```

- [ ] **Step 5: Implementar o serviço e a rota**

No `relatorio.service.ts`:

```ts
  /**
   * Proxy puro. O `resolverEscopo` é o MESMO do relatório — sem turma, porque
   * o estudante já é identificado e o `cursinhoId` do JWT é o gate.
   */
  async consultarDetalhe(
    colaboradorUserId: string,
    simuladoId: string,
    userId: string,
  ): Promise<DetalheDoEstudanteDtoOutput> {
    const cursinhoId = await this.resolverEscopo(colaboradorUserId);
    return this.http.buscarDetalheDoEstudante(
      simuladoId,
      userId,
      cursinhoId,
    ) as Promise<DetalheDoEstudanteDtoOutput>;
  }
```

No `relatorio.controller.ts`, junto das outras rotas de `:simuladoId` (**depois** das literais `simulados…`, se elas já existirem neste branch):

```ts
  @Get(':simuladoId/estudante/:userId')
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'o que o estudante marcou e o que era correto',
    type: DetalheDoEstudanteDtoOutput,
  })
  @ApiResponse({ status: 404, description: 'estudante não tem cartão neste simulado' })
  @ApiResponse(RESPOSTA_403)
  @SetMetadata(PermissionsGuard.name, Permissions.gerenciarEstudantes)
  async detalheDoEstudante(
    @Param('simuladoId') simuladoId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ): Promise<DetalheDoEstudanteDtoOutput> {
    return this.service.consultarDetalhe((req.user as User).id, simuladoId, userId);
  }
```

- [ ] **Step 6: Rodar e confirmar que passam**

Run: `npx jest src/modules/simulado src/modules/prepCourse`
Expected: PASS

- [ ] **Step 7: Provar que dois testes discriminam**

**(a)** Mande o `userId` do JWT em vez do `cursinhoId` resolvido. O teste do JWT tem que falhar.
**(b)** Tire o `@SetMetadata` do handler novo. O `it.each` da permissão tem que falhar.

Reverta e confirme. Reporte.

- [ ] **Step 8: Build e commit**

```bash
npm run build
git add src/modules/simulado/relatorio/
git commit -m "feat: proxy e rota do detalhe do estudante na api"
```

⚠️ **Não rode `npm test`.**

---

## Task 5: Tipos e serviço no client

**Repo:** `client-vcnafacul` — `cd ../client-vcnafacul`, branch `feature/07-detalhe-do-estudante` saindo de `develop`.

**Files:**
- Modify: `src/dtos/relatorioSimulado/relatorioSimulado.ts`
- Create: `src/services/relatorioSimulado/buscarDetalheDoEstudante.ts`
- Test: `src/services/relatorioSimulado/buscarRelatorio.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao `describe` existente:

```ts
  it("buscarDetalheDoEstudante monta a URL com simulado e usuário", async () => {
    await buscarDetalheDoEstudante("tok", "sim-1", "u1");

    expect(fetchWrapper.mock.calls[0][0]).toContain(
      "/mssimulado/relatorio/simulado/sim-1/estudante/u1",
    );
  });

  it("404 vira erro em português, não tela quebrada", async () => {
    fetchWrapper.mockResolvedValue({ status: 404, json: async () => ({}) });

    await expect(buscarDetalheDoEstudante("tok", "sim-1", "u1")).rejects.toThrow(
      /estudante|detalhe/i,
    );
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/relatorioSimulado/`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Acrescentar os tipos**

Em `src/dtos/relatorioSimulado/relatorioSimulado.ts`:

```ts
/**
 * ⚠️ Três estados, não dois. E é `sem_leitura`, não `em_branco`: o ms-omr
 * descarta questão em branco e dupla marcação igualmente, então os dois chegam
 * indistinguíveis. O rótulo diz o que se sabe.
 */
export type ResultadoDaQuestao = "acerto" | "erro" | "sem_leitura";

export interface RespostaDoEstudante {
  numero: number | null;
  questaoId: string;
  /** AUSENTE quando não houve leitura — não vazio, não nulo. */
  alternativaEstudante?: string;
  alternativaCorreta?: string;
  /** ⚠️ Classificado pelo ms, não aqui: a regra de "sem leitura" é a ausência
   *  da chave, e duas implementações dela divergiriam. */
  resultado: ResultadoDaQuestao;
}

export interface DetalheDoEstudante {
  status: StatusDoCartao;
  falha?: FalhaHistorico;
  respostas: RespostaDoEstudante[];
}
```

- [ ] **Step 4: Criar o serviço**

`src/services/relatorioSimulado/buscarDetalheDoEstudante.ts`:

```ts
import { DetalheDoEstudante } from "@/dtos/relatorioSimulado/relatorioSimulado";
import fetchWrapper from "@/utils/fetchWrapper";
import { relatorioSimulado } from "../urls";

export async function buscarDetalheDoEstudante(
  token: string,
  simuladoId: string,
  userId: string,
): Promise<DetalheDoEstudante> {
  const response = await fetchWrapper(
    `${relatorioSimulado}/${simuladoId}/estudante/${userId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (response.status !== 200) {
    throw new Error("Erro ao buscar o detalhe do estudante");
  }
  return await response.json();
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/services/relatorioSimulado/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/dtos/relatorioSimulado/relatorioSimulado.ts src/services/relatorioSimulado/buscarDetalheDoEstudante.ts src/services/relatorioSimulado/buscarRelatorio.test.ts
git commit -m "feat: tipos e servico do detalhe do estudante"
```

---

## Task 6: O modal

**Files:**
- Create: `src/pages/relatorioSimulado/DetalheDoEstudante.tsx`
- Modify: `src/pages/relatorioSimulado/index.tsx`
- Test: `src/pages/relatorioSimulado/DetalheDoEstudante.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DetalheDoEstudante } from "./DetalheDoEstudante";

const buscarDetalheDoEstudante = vi.hoisted(() => vi.fn());
vi.mock("@/services/relatorioSimulado/buscarDetalheDoEstudante", () => ({
  buscarDetalheDoEstudante,
}));

const resposta = (over = {}) => ({
  numero: 1,
  questaoId: "q1",
  alternativaEstudante: "A",
  alternativaCorreta: "A",
  resultado: "acerto",
  ...over,
});

const montar = (props = {}) =>
  render(
    <DetalheDoEstudante
      token="tok"
      simuladoId="sim-1"
      estudante={{ usuario: "u1", nome: "Ana Silva", matricula: "2025001" }}
      isOpen
      onClose={vi.fn()}
      {...props}
    />,
  );

describe("DetalheDoEstudante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buscarDetalheDoEstudante.mockResolvedValue({
      status: "completed",
      respostas: [
        resposta(),
        resposta({ numero: 2, questaoId: "q2", alternativaEstudante: "B", alternativaCorreta: "C", resultado: "erro" }),
        resposta({ numero: 3, questaoId: "q3", alternativaEstudante: undefined, alternativaCorreta: "D", resultado: "sem_leitura" }),
      ],
    });
  });

  it("mostra o nome de quem está sendo visto", async () => {
    montar();

    expect(await screen.findByText(/Ana Silva/)).toBeInTheDocument();
  });

  it("uma linha por questão, com marcada e correta", async () => {
    montar();

    await screen.findByText("1");
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(4);
  });

  it("⚠️ certo/errado NÃO depende só de cor — há texto ou símbolo", async () => {
    // verde e vermelho sozinhos excluem quem não distingue as duas. E as
    // medições do tokens.ts: green3 dá 3.77:1 e red 3.88:1 sobre branco —
    // passa para componente gráfico, não para texto pequeno.
    montar();

    expect(await screen.findByText(/acertou/i)).toBeInTheDocument();
    expect(screen.getByText(/errou/i)).toBeInTheDocument();
  });

  it("⚠️ sem leitura é distinguível de erro", async () => {
    // juntar os dois distorce a leitura que o professor faz
    montar();

    expect(await screen.findByText(/sem leitura/i)).toBeInTheDocument();
  });

  it("histórico falho mostra a descrição do erro, não tabela vazia", async () => {
    buscarDetalheDoEstudante.mockResolvedValue({
      status: "failed",
      falha: {
        codigo: "cartao_nao_detectado",
        descricao: "Não foi possível localizar o cartão na foto",
        acaoSugerida: "reenviar_foto",
      },
      respostas: [],
    });
    montar();

    expect(
      await screen.findByText(/não foi possível localizar o cartão/i),
    ).toBeInTheDocument();
  });

  it.each([["awaiting_omr"], ["pending"], ["processing"]])(
    "status %s diz que ainda está processando",
    async (status) => {
      buscarDetalheDoEstudante.mockResolvedValue({ status, respostas: [] });
      montar();

      expect(await screen.findByText(/processando|aguardando/i)).toBeInTheDocument();
    },
  );

  it("⚠️ não busca enquanto está fechado", async () => {
    // o modal é montado pela tela do relatório junto com a linha; buscar aqui
    // seria uma chamada por linha da tabela
    montar({ isOpen: false });

    await waitFor(() => expect(buscarDetalheDoEstudante).not.toHaveBeenCalled());
  });

  it("erro na busca é recuperável", async () => {
    buscarDetalheDoEstudante.mockRejectedValueOnce(new Error("caiu"));
    montar();

    const tentar = await screen.findByRole("button", { name: /tentar novamente/i });
    buscarDetalheDoEstudante.mockResolvedValue({ status: "completed", respostas: [resposta()] });
    fireEvent.click(tentar);

    expect(await screen.findByText("1")).toBeInTheDocument();
  });
});
```

⚠️ **Leia o `ModalTemplate`** (`src/components/templates/modalTemplate`) e o `editDisponibilidadeModal.tsx` antes — eles dão o padrão de `isOpen`/`onClose` da casa. Ajuste os testes à estrutura que o `ModalTemplate` realmente renderiza (pode não haver `role="row"` se ele não usar `<table>`; use o que existe).

⚠️ **Confira o rótulo do botão de retry** que você renderizar e case a regex com ele.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/pages/relatorioSimulado/DetalheDoEstudante.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o modal**

Use `ModalTemplate`, o `DashTable` do Dash V2 para a lista (consistente com o resto da tela), e uma função pura para o rótulo do resultado:

```tsx
/**
 * ⚠️ **Texto, não só cor.** Certo/errado por verde e vermelho sozinhos exclui
 * quem não distingue as duas — e as medições do `tokens.ts` mostram que
 * `green3` (3.77:1) e `red` (3.88:1) sobre branco passam para componente
 * gráfico, **não** para texto pequeno. O rótulo carrega o significado; a cor
 * só acelera a leitura de quem a enxerga.
 */
export function rotuloDoResultado(r: ResultadoDaQuestao): {
  texto: string;
  tone: StatusV2;
} {
  switch (r) {
    case "acerto":
      return { texto: "Acertou", tone: "done" };
    case "erro":
      return { texto: "Errou", tone: "missing" };
    default:
      // ⚠️ "Sem leitura", não "em branco": branco e dupla marcação chegam
      // indistinguíveis do ms-omr.
      return { texto: "Sem leitura", tone: "neutral" };
  }
}
```

O corpo: quando `status === 'failed'`, mostra `falha.descricao` em vez da tabela. Quando é `awaiting_omr`/`pending`/`processing`, uma frase dizendo que está processando. Caso contrário, a tabela.

⚠️ **Busca só quando `isOpen`** — o modal é renderizado pela tela do relatório, e buscar sempre seria uma chamada por linha.

- [ ] **Step 4: Ligar na tela do relatório**

Em `src/pages/relatorioSimulado/index.tsx`, acrescente estado para a linha selecionada, passe `onRowClick` ao `DashTable` de estudantes, e renderize o modal.

⚠️ **Só abre para quem enviou cartão.** Linha com `enviouCartao: false` não tem o que detalhar, e a rota devolveria 404 — não faça o clique abrir um modal que só sabe dar erro.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/pages/relatorioSimulado/`
Expected: PASS

- [ ] **Step 6: Provar que dois testes discriminam**

**(a)** Troque o rótulo de `sem_leitura` por "Errou". O teste de "sem leitura é distinguível" tem que falhar.
**(b)** Tire a guarda `isOpen` da busca. O teste de "não busca enquanto fechado" tem que falhar.

Reverta e confirme. Reporte.

- [ ] **Step 7: Suíte, build e commit**

```bash
npx vitest run
npm run build
ESLINT_USE_FLAT_CONFIG=false npx eslint src/pages/relatorioSimulado src/services/relatorioSimulado src/dtos/relatorioSimulado
git add src/pages/relatorioSimulado/DetalheDoEstudante.tsx src/pages/relatorioSimulado/DetalheDoEstudante.test.tsx src/pages/relatorioSimulado/index.tsx
git commit -m "feat: modal do detalhe do estudante no relatorio"
```

---

## Fechamento

⚠️ **Gate manual, para o PR** — jsdom não alcança:

1. O contraste real de acerto/erro/sem leitura, e que o significado sobrevive sem a cor
2. Um simulado de 90 questões: a tabela dentro do modal rola bem?
3. Clicar numa linha de quem **não enviou** — a ação não pode abrir modal nenhum
