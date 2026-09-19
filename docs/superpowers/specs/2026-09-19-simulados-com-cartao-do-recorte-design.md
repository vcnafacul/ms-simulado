# Quais simulados têm cartão neste recorte

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/04b-BACK-simulados-com-cartao-do-recorte.md`
> Repos: `ms-simulado` (o grosso) e `api-vcnafacul` (proxy fino)
> Branch nos dois: `feature/04b-simulados-com-cartao`
> A branch da api sai de `feature/04-orquestracao-do-relatorio` (PR **#551**, aberto), não da develop —
> o módulo `simulado/relatorio` só existe lá.

---

## Por que este card existe, e por que não é um apêndice do `05`

O card `05` propôs listar, na tela de turma, os simulados que já têm cartão, e escreveu que a rota
*"vale acrescentar ao escopo do `02` em vez de virar card próprio"*.

**O `02` não pegou.** Medido: o spec do `02` não a menciona nem nos critérios de aceite, e o código
mergeado confirma — `relatorio-simulado-estudante.repository.ts` tem quatro métodos (`registrar`,
`buscarPorRecorte`, `contarDoCursinho`, `agregarPorQuestao`), nenhum `distinct`, nenhum `$group` por
simulado, nenhuma rota, em nenhum branch dos dois repos.

⚠️ **E o bloqueio não é só do `05`.** O `06` tem o critério *"simulado sem cartão: ação desabilitada
com motivo no tooltip"*, que é **exatamente o mesmo fato**. O `SimuladoResumo` do client
(`dtos/prova/prova.ts:6`) não carrega nada sobre cartão, e `vezesRespondido` não substitui por dois
motivos — é contador de histórico, então contaria quem respondeu **digital**, que é justamente o
recorte que esta série exclui; e, medido, **nada no ms-simulado o incrementa**: os três únicos usos em
`ms-simulado/src` são a declaração no `simulado.schema.ts:35`, uma leitura em `historico.service.ts:63`
(`testAttempts`) e um fixture de teste.

Então: a rota é a peça que faltou no contrato do `02`/`04`, e **pré-requisito dos dois cards de tela**.

---

## O contrato

### ms-simulado

`GET /v1/relatorio-simulado/simulados?cursinhoId=X[&turmaId=Y]`

`cursinhoId` obrigatório, `turmaId` opcional — o mesmo `ConsultarRelatorioDtoInput` que as duas rotas
existentes usam, sem `:simuladoId`. Mesma recusa quando `cursinhoId` não vem.

### api-vcnafacul

`GET /mssimulado/relatorio/simulado/simulados`

Proxy fino no módulo do card `04`: `gerenciarEstudantes`, `cursinhoId` **sempre do JWT**, nenhum
parâmetro o troca. Nenhuma hidratação — esta rota devolve simulados, não pessoas, então o MySQL não
entra.

### O que volta, por simulado

| campo | o que é |
|---|---|
| `simuladoId` | o id |
| `nome` | o nome do simulado |
| `cartoes` | quantos cartões foram enviados no recorte |
| `comLeituraConcluida` | quantos desses têm `status: completed` |
| `ultimoEnvio` | data do cartão mais recente daquele simulado no recorte |

Ordenado por `ultimoEnvio` **decrescente**.

---

## Decisões

### Dois números, não um

⚠️ **Cartão que falhou na leitura continua sendo cartão enviado, e TEM relatório** — é ali que o
coordenador descobre o motivo, que é a razão de ser da série inteira. Então `cartoes` conta tudo, e é
ele que habilita a ação do `06`.

Mas "12 cartões" com 3 falhos lê como 12 resultados prontos. Por isso `comLeituraConcluida` vem junto.
O par espelha o `resumo` do card `04`, que já devolve `totalNoRecorte` e `comLeituraConcluida` pelo
mesmo motivo: sem as duas contagens ninguém entende a diferença.

⚠️ **Contar só `completed` seria o pior dos três.** Um simulado em que todos os cartões falharam
contaria zero, a ação do `06` ficaria desabilitada, e ninguém veria as falhas.

### Mais recente primeiro

O coordenador quase sempre quer o último simulado aplicado. `$max` do `createdAt` das linhas daquele
simulado.

⚠️ **Ressalva medida:** o schema da junção é `@Schema({ timestamps: false })`, mas o `BaseSchema` dá
`createdAt` com `default: () => now()`. E o `registrar` é **upsert** — um reenvio depois de falha
atualiza a linha existente e **não rebumba a data**. Então `ultimoEnvio` é *"quando o primeiro cartão
daquele simulado chegou"*, não *"a última atividade"*. Para ordenar uma lista de simulados é o que
interessa; o nome do campo não deve prometer mais do que isso.

### O nome sai de um `Map`, não de um `$lookup`

O nome não está na junção. Uma consulta `find({ _id: { $in: ids } })` e um `Map` no serviço — a mesma
decisão que o card `03` tomou para o número da questão, e pelo mesmo motivo: abrir um `$lookup` para
buscar um campo custa mais complexidade do que uma leitura de documentos pequenos.

### Índice novo

Os dois índices da junção são `{ simulado: 1, cursinhoId: 1 }` e `{ simulado: 1, turmaId: 1 }` — **os
dois prefixados por `simulado`**. Esta consulta filtra por `cursinhoId` (e talvez `turmaId`) e **não**
por simulado, então nenhum deles serve: seria varredura de coleção.

**Acrescentar `{ cursinhoId: 1, turmaId: 1 }`.** Funciona para os dois recortes — o Mongo usa prefixo
de índice composto, então a consulta só por `cursinhoId` também é servida.

### `deleted` não é filtrado, de propósito

O `agregarPorQuestao` vizinho não filtra `deleted`, e agregação não passa pelo `select: false` do
Mongoose de qualquer jeito. Inventar o filtro só aqui faria as duas consultas do mesmo relatório
discordarem sobre quais linhas existem. Nada no código marca linha da junção como deletada.

---

## A agregação

```
$match   { cursinhoId [, turmaId] }
$lookup  historicos → h
$unwind  h, preserveNullAndEmptyArrays: true
$group   _id: '$simulado'
         cartoes:             { $sum: 1 }
         comLeituraConcluida: { $sum: { $cond: [{ $eq: ['$h.status', 'completed'] }, 1, 0] } }
         ultimoEnvio:         { $max: '$createdAt' }
$sort    { ultimoEnvio: -1 }
```

⚠️ **O `preserveNullAndEmptyArrays: true` é corretude, não estilo.** O próprio repositório tipa
`historico: Historico | null` porque *"o `populate` de uma ref apagada devolve `null`, não lança"*. Sem
a flag, o `$unwind` **descarta** a linha cuja ref morreu, e `cartoes` passa a contar menos cartões do
que foram enviados — sem nada acusar. Com ela, `$h.status` fica ausente, o `$eq` dá falso, e a linha
conta como enviada e não concluída. Que é a leitura certa.

⚠️ **Note a diferença para o `agregarPorQuestao`:** lá o `$unwind` é estrito **e** seguido de
`$match: { 'h.status': completed }`, porque lá o objetivo é descartar quem não completou. Aqui o
objetivo é o oposto — contar todo mundo e classificar. As duas agregações vivem no mesmo arquivo e
parecem irmãs; **não são**, e um teste precisa fixar isso.

---

## Riscos

⚠️ **Colisão de rota literal × `:param` — nos DOIS repos.** O controller do ms já tem
`@Get(':simuladoId')` e `@Get(':simuladoId/questoes')`; o da api tem os quatro do card `04`. Uma rota
`simulados` tem a **mesma contagem de segmentos** que `:simuladoId`, então **colide de verdade** — ao
contrário do caso do card `04`, em que as rotas diferiam em contagem e a colisão era só aparente.

Aqui só a **ordem de declaração** resolve: a literal vem antes. E é a classe de defeito que **nenhum
teste de unidade pega**, porque nasce no roteamento e não no controller — o teste chama o método
direto. Precisa de um teste que **suba o app**, nos dois repos, como o do card `04`.

Sintoma se passar: `simulados` vira o valor de `:simuladoId`, e a resposta é um 400 de ObjectId
inválido — ou pior, um 200 errado.

⚠️ **`{ turmaId: undefined }` casa só quem NÃO tem turma** — lição medida no card `02`: serializa para
`{ turmaId: null }`. O filtro precisa **omitir** a chave quando não há turma, não passá-la indefinida.

⚠️ **A branch da api sai do `04`, que ainda não foi mergeado.** Se o `04` mudar em revisão, esta
branch rebasa. Não abrir o PR da api contra a develop sem que o `#551` tenha entrado.

## Fora de escopo

- Paginação — um cursinho tem dezenas de simulados com cartão, não milhares.
- Qualquer dado de estudante.
- Filtro ou ordenação por nome no servidor — a tela ordena, e o Dash V2 já traz o `sortRows.ts`.

## Critérios de aceite

- [ ] Devolve `simuladoId`, `nome`, `cartoes`, `comLeituraConcluida` e `ultimoEnvio`, por simulado
- [ ] `turmaId` restringe ao conjunto da turma; ausente, o filtro **omite** a chave
- [ ] `cursinhoId` obrigatório no ms; na api vem do JWT e nenhum parâmetro o troca
- [ ] Recorte sem nenhum cartão devolve lista vazia, não erro
- [ ] Linha cuja ref de histórico morreu **continua contando** em `cartoes` — afirmado por teste
- [ ] `comLeituraConcluida` conta só `completed`; cartão falho conta em `cartoes` e não nela
- [ ] Ordem por `ultimoEnvio` decrescente
- [ ] Índice `{ cursinhoId: 1, turmaId: 1 }` criado
- [ ] **Teste que sobe o app**, nos dois repos, provando que `/simulados` não é capturada por
      `:simuladoId`
- [ ] Simulado de outro cursinho não aparece — teste de isolamento
- [ ] Teste contra Mongo real, como os dos cards `02` e `03`
