# `GET historico/:id` passa a checar dono

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/11-SEG-historico-por-id-sem-dono.md`
> Repos: `ms-simulado` e `api-vcnafacul` · Branch nos dois: `feature/11-historico-por-id-com-dono`
> Achado na investigação do card `07`, que decidiu **não** construir tela sobre esta rota.

---

## O defeito

`api-vcnafacul/src/modules/simulado/historico/historico.controller.ts` — `getById` recebe o id,
**não injeta o `req.user`**, e o serviço é passthrough puro para `v1/historico/${id}`. Não há
checagem de dono em lugar nenhum do caminho.

⚠️ **Qualquer usuário autenticado lê o histórico de qualquer outro pelo id** — inclusive um estudante
lendo o de outro estudante: respostas marcadas, gabarito, aproveitamento por matéria.

Os dois vizinhos no mesmo controller escopam por `(req.user as User).id`. O `getById` é o fora da
curva.

## O levantamento: o gate não quebra nada

⚠️ **Um único chamador no client.** `services/historico/getHistoricoSimuladoById.ts`, consumido só
por `pages/simulationHistory` (a tela de aproveitamento de um simulado).

E os dois caminhos que produzem aquela URL vêm da lista do próprio usuário — `getAllHistoricoSimulado`,
que o gateway já escopa por `req.user`. **Nenhuma tela de cursinho usa a rota**: no relatório, o
`historicoId` só vai para o `reprocessarCartao` do card `09`.

## ⚠️ O gate sozinho é contornável

`historico.service.ts` da api interpola cru:

```ts
return this.axios.get(`v1/historico/${id}`);
return this.axios.get(`v1/historico/performance/${userId}`);
```

É a mesma classe que o card `09` fechou no `relatorio-http.service.ts` — cujo docblock **cita esta
rota pelo nome** como o que um segmento não escapado alcança, e cujo spec tem teste de regressão com
`'../../../historico/abc'`.

**Um `:id` que seja ele próprio um caminho passa por baixo da checagem de dono.** Então
`encodeURIComponent` nos dois métodos faz parte do conserto, não é higiene à parte.

## A comparação mora no ms

A api não tem o documento — ele vive no Mongo do ms. Se a api buscar e comparar na volta, ela **já
trouxe as respostas alheias para dentro do processo** antes de descobrir que não podia: um 403 depois
do vazamento.

Então a rota do ms passa a receber o `usuario` e recusa lá.

### ⚠️ Método novo, não alargar o `getById`

`HistoricoRepository.getById` é um `override` do `BaseRepository`, e tem **dois chamadores internos**
(`simulado.service.ts` e `answer-processor.service.ts`) que legitimamente leem por id sem contexto de
usuário. Mudar a assinatura quebra os dois e briga com a classe base.

**`getByIdAndUsuario(id, usuario)`**, com `findOne({ _id: id, usuario })` e o mesmo `populate`. O
`getById` fica como está.

### 404, não 403

O `findOne` devolvendo `null` já é indistinguível de "não existe", e o serviço da api repassa `null`.
Um 403 confirmaria a existência do histórico alheio a quem perguntou.

## Os três agregados ganham `JwtAuthGuard`

`getSummary`, `getAggregateByPeriod` e `getAggregateByPeriodAndType` não têm guard nenhum.

⚠️ **A premissa anterior era falsa.** O card dizia que eram públicos de propósito, alimentando a home.
**Verificado:** a seção "Impacto do Projeto" chama outras cinco rotas
(`services/public/impactStats.ts`), nenhuma delas de histórico — e o prefixo `dashboardPublic*` delas
mostra que a casa já tem um padrão para "público de propósito", que estas três não seguem.

Os cinco consumidores reais mandam token e vivem atrás de `ProtectedRoute`. **Fechar não quebra
nenhum.**

⚠️ **Sem permissão, de propósito.** O `summary` alimenta o `SimuladosWidget`, que é
`profiles: ['common']` — **todo usuário logado**, inclusive estudante. Exigir papel administrativo ali
derrubaria o painel de todo mundo.

## Um comentário no `GetHistoricoDTOInput`

O DTO da api declara `userId` **sem decorator de class-validator**. Quem impede um `userId` injetado
pelo cliente é o `whitelist: true` global, que o descarta antes de o serviço montar a query.

⚠️ **Funciona por acidente, não por desenho.** Um `@IsOptional()` ali e o escopo do `getAllByUser`
cai. Este card não muda o comportamento — só escreve isso onde é lido.

## Fora de escopo

- **O over-fetch do `cartao-resposta/resultados`.** Ele chama `getAllByUser` com o id de outra pessoa
  — legitimamente, sob `visualizarEstudantes` e escopo de cursinho — mas devolve o `Historico`
  completo, com `respostas` e gabarito, enquanto a tela só lê `historicos.length`. Invisível na UI,
  presente no fio. **Card próprio.**
- A rota do coordenador (`relatorio/simulado/:simuladoId/estudante/:userId`), que o card `07`
  construiu com gate de cursinho. Continua como está.
- O cache global dos agregados, que ignora o `groupBy` na chave — bug pré-existente, card próprio.

## Critérios de aceite

- [ ] `GET /mssimulado/historico/:id` devolve **404** para histórico que não é do requisitante
- [ ] A recusa acontece **no ms** — as respostas alheias não entram no processo da api
- [ ] `encodeURIComponent` no `getById` **e** no `getPerformance`
- [ ] Teste do caminho feliz e do negado, nos dois repos
- [ ] `getById` do repositório do ms **não muda de assinatura** — os dois chamadores internos seguem
- [ ] Os três agregados ganham `JwtAuthGuard`, sem permissão
- [ ] O `GetHistoricoDTOInput` ganha o comentário sobre o `whitelist`
