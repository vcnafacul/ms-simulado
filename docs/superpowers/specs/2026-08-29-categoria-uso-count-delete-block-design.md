# Categoria: contagem de uso e bloqueio de delete (simulado + prova)

**Data:** 2026-08-29
**Origem:** [client-vcnafacul#641](https://github.com/vcnafacul/client-vcnafacul/issues/641), retorno de QA de @cleytonbiffe
**Repos afetados:** `ms-simulado`, `api-vcnafacul`, `client-vcnafacul`

## Contexto

O card 05 do CRUD de Categoria (`ManageCategorias` no `client-vcnafacul`) entregou o modal de gerenciamento de categorias, mas dois critérios de aceitação ficaram incompletos e foram apontados no retorno de QA:

1. O card de categoria não mostra quantos simulados/provas estão vinculados a ela.
2. É possível deletar uma categoria mesmo que ela tenha simulados/provas vinculados — o delete deveria bloquear com 409.

Investigação do estado atual do código mostrou que o Ponto 2 já está **parcialmente** resolvido: `CategoriaService.delete()` (ms-simulado) já bloqueia com 409 quando há `Simulado` vinculado, via `SimuladoRepository.countByCategoria`. O que falta é a mesma checagem para `Prova`, que também tem FK para `Categoria` mas nunca foi incluída nessa validação (`ProvaRepository` não tem `countByCategoria`). O Ponto 1 não existe em nenhuma camada — nem endpoint, nem campo, nem UI.

A badge "🔒 Categoria seedada" (lista hardcoded `CATEGORIAS_PROTEGIDAS` no frontend) fica fora do escopo deste ajuste — não é alterada.

## Arquitetura

Fluxo: `ms-simulado` (fonte de verdade, Mongo/Mongoose) → `api-vcnafacul` (proxy HTTP puro via Axios, sem lógica própria) → `client-vcnafacul` (exibição). As mudanças de negócio ficam concentradas no `ms-simulado`; as outras duas camadas só propagam os novos campos.

## Decisões

- **Regra de bloqueio no delete:** bloquear se `simuladosUsando > 0` OU `provasUsando > 0` (contagens reportadas separadamente no payload do 409, não somadas).
- **Exibição da contagem no card:** separada — "X simulados · Y provas em uso" — para deixar claro o que está travando o delete, em vez de um total combinado.
- **Botão de excluir:** desabilitado preventivamente com tooltip quando `simuladosCount + provasCount > 0`, usando a contagem já carregada na listagem. O 409 do backend continua existindo como validação real (defesa em profundidade contra bypass client-side ou race condition — ex.: um simulado criado enquanto o modal está aberto).
- **Estratégia de contagem em `getAll`/`getById`:** aggregation pipeline (`$lookup` em `simulado` e `prova` + `$project` contando os arrays), substituindo o `.populate('exame')` simples atual. Evita N+1 queries e escala com o número de categorias.

## Componentes afetados

### ms-simulado

- `ProvaRepository`: novo método `countByCategoria(categoriaId): Promise<number>`, espelhando o já existente em `SimuladoRepository`.
- `CategoriaModule`: passa a importar `forwardRef(() => ProvaModule)` (mesmo padrão já usado com `SimuladoModule`).
- `CategoriaService`:
  - injeta `ProvaRepository`.
  - `delete()`: chama `SimuladoRepository.countByCategoria` e `ProvaRepository.countByCategoria` em paralelo (`Promise.all`); se qualquer um for `> 0`, lança `ConflictException` com `{ message, simuladosUsando, provasUsando }` (estende o payload atual, que hoje só tem `simuladosUsando`).
- `CategoriaRepository.getAll` / `getById`: reescritos como aggregation pipeline com `$lookup` em `simulado` e `prova`, retornando `simuladosCount` e `provasCount` por categoria (além do `populate('exame')` que já existe).
- DTO/schema de saída de Categoria ganham `simuladosCount: number` e `provasCount: number`.

### api-vcnafacul (proxy)

- `CategoriaDTO` (`src/modules/simulado/dtos/categoria.dto.output.ts`) ganha os mesmos dois campos — passthrough puro, sem lógica nova.

### client-vcnafacul

- `ICategoria` (`src/dtos/categoria/categoria.ts`) ganha `simuladosCount: number` e `provasCount: number`.
- `manageCategorias/index.tsx`: card passa a mostrar "X simulados · Y provas em uso" (ou "Sem simulados/provas em uso" quando ambos são 0); botão de excluir fica `disabled` com tooltip explicativo quando `simuladosCount + provasCount > 0`.
- `services/categoria/deleteCategoria.ts`: passa a ler `provasUsando` do corpo do erro 409 também, montando mensagem combinada (ex.: "Categoria em uso — 2 simulados e 5 provas usam essa categoria").

## Fluxo de dados

1. Client chama `getCategorias()` → api-vcnafacul repassa → ms-simulado roda a aggregation e devolve a lista já com `simuladosCount`/`provasCount`.
2. Client renderiza as contagens no card e desabilita o botão de excluir quando a soma for `> 0`.
3. Se mesmo assim uma exclusão for tentada (chamada direta à API, ou race condition), o backend valida no `delete()` e retorna 409 com as duas contagens. O client já trata esse erro hoje.

## Tratamento de erros

Nenhum caso novo de erro além do 409 já existente — apenas estendemos o payload dele com `provasUsando`. Segue o padrão de defesa em profundidade: UI preventiva (botão desabilitado) + validação real no servidor (409).

## Testes

- **ms-simulado**:
  - Teste unitário para `ProvaRepository.countByCategoria`.
  - `categoria.service.spec.ts`: estender o `describe('delete')` para cobrir os 4 cenários — só simulados (já existe), só provas (novo), ambos, nenhum → sucesso.
  - Teste para `getAll`/`getById` confirmando que `simuladosCount`/`provasCount` vêm corretos na resposta da aggregation.
- **client-vcnafacul**: se já houver testes do modal `ManageCategorias`, cobrir a renderização das contagens e a desabilitação do botão; caso não exista suíte para o modal, fica como validação manual — não será introduzida uma suíte nova fora do escopo deste ajuste.

## Fora de escopo

- Badge "🔒 Categoria seedada" e a lista hardcoded `CATEGORIAS_PROTEGIDAS` — não são alteradas.
- Qualquer campo persistido tipo `protegida`/`seedada` no schema de Categoria — não introduzido aqui.
