# A consulta do relatório por cursinho ou por turma

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/02-BACK-historicos-por-simulado-restritos-a-usuarios.md`
> Repo: `ms-simulado` · Branch: `feature/02-consulta-relatorio-por-recorte`
> Depende de: `08b` (a coleção de junção, ms **PR #192**) e `01` (o mapa de falhas, ms **PR #191**)

---

## O que existe hoje

O card `08b` criou `RelatorioSimuladoEstudante`, uma linha por estudante por simulado por cursinho,
gravada no envio do cartão:

```ts
{ historico: ref, simulado: ref, usuario: string, cursinhoId: string, turmaId?: string }
```

Índices: `{simulado, cursinhoId}`, `{simulado, turmaId}`, único em `{simulado, cursinhoId, usuario}`.

O que **não** existe é qualquer consulta sobre ela — o repositório só tem `registrar`. Este card cria
a leitura.

## A rota

`GET /v1/relatorio-simulado/:simuladoId?cursinhoId=X[&turmaId=Y]`

Devolve por estudante: `usuario`, `turmaId`, `historicoId`, `status`, `cartaoCode`,
`aproveitamentoGeral`, `questoesRespondidas`, e `falha` **descrita** quando houver.

Mais, ao lado das linhas, `totalEstudantesComCartaoNoCursinho`.

## Decisões

### `cursinhoId` é obrigatório

Sem ele a rota vira "todas as linhas deste simulado" e qualquer chamador enxerga todos os cursinhos.
A versão anterior deste card usava uma lista de `userId` e a descrevia como *"um vazamento esperando
o dia em que alguém esquecer de passá-la"* — um parâmetro opcional aqui é o mesmo vazamento por outra
porta.

### Sem paginação

⚠️ Não é preguiça, é o que o card `04` precisa. Ele monta a lista partindo dos **estudantes** do
MySQL e faz `left join` com estas linhas, para que quem **não enviou** cartão apareça como "não
enviou" — metade do valor do relatório para quem coordena.

Se o ms paginasse, a api não conseguiria esse join sem voltar a mandar uma lista de ids ao ms, que é
justamente a peça que o card `08` eliminou. Quem pagina é a api, contra a lista de estudantes, que é
a ordem autoritativa.

O recorte é um cursinho: algumas centenas de linhas pequenas. O custo é irrelevante.

### O contador é escopado no cursinho, não global

`totalEstudantesComCartaoNoCursinho = countDocuments({ simulado, cursinhoId })`.

⚠️ **E não "cartões fora do cursinho" — esse caso não existe mais.** O card `08b` fez o upload
resolver o `cursinhoId` pelo JWT de quem envia e recusar, com **403**, estudante que não seja daquele
cursinho (`api-vcnafacul/src/modules/simulado/cartao-resposta/cartao-upload.service.ts:82`). Não há
linha cujo cursinho o estudante não pertença. A situação 3 do card `08` ficou fechada por construção.

O contador serve a **uma** tela: o rodapé do relatório por turma — *"27 dos 30 cartões deste simulado
são desta turma"*. A diferença são alunos de outra turma ou **sem** turma dentro do mesmo cursinho,
que é o item 2 do card `08`. No relatório geral do cursinho o número é sempre igual ao de linhas, e a
tela não o mostra.

⚠️ Escopar nunca é opcional aqui: um `countDocuments({ simulado })` global diria a um cursinho quantos
cartões os outros enviaram.

### `descreverFalha` é chamado aqui

⚠️ **Nada no código força isso.** É a contrapartida de o card `01` derivar a descrição na camada de
serviço em vez de num virtual do Mongoose. Sem a chamada, a coluna de erro dos cards `05`/`06` chega
com `cartao_nao_detectado` cru em vez de *"Não foi possível localizar o cartão na foto…"*, e o card
`01` inteiro não aparece na tela.

O teste tem que afirmar a **descrição**, não o código — senão ele passa com a chamada ausente.

### Todos os status, e `aproveitamento` ausente e não zero

Cartão `failed` ou `awaiting_omr` não tem respostas. A rota devolve todos os status:

- o pedido é explícito em mostrar o erro na linha do aluno; filtrar os `failed` aqui tornaria isso
  impossível nas telas;
- **zero é uma nota; ausência de leitura não é.** Se os dois chegarem iguais, a média do card `04`
  fica errada e ninguém percebe.

Quem decide o que exibir é a tela, não a consulta.

### `populate`, não `$lookup`

A junção guarda `historico: ref`; os dados do relatório estão no `Historico`. `populate` é o idioma
desta casa — `historico.repository.ts` usa nos dois métodos de leitura — e é legível.

⚠️ `populate` com `select` explícito, não o documento inteiro: `respostas` de um simulado de 90
questões, multiplicado por 500 estudantes, é carga que nenhuma tela desta série usa. O card `07`
(detalhe do estudante) busca o histórico por id quando precisar.

`$lookup` fica para o card `03`, que agrega por questão e precisa de `$unwind`.

### Onde mora

No módulo `relatorio-simulado-estudante`, que já existe e é dono da coleção. Ele ganha controller e
service; hoje só tem schema, repositório e módulo.

---

## Riscos

⚠️ **O recorte tem que ir para o Mongo, não voltar para a api.** Buscar tudo e filtrar do outro lado
transporta dados alheios pela rede interna e não escala. O teste de isolamento precisa provar isso
com dois cursinhos de verdade na consulta, não só conferir o retorno.

⚠️ **`turmaId` ausente ≠ turma inexistente.** ~~Um filtro `{turmaId: undefined}` em Mongo casa
**todos** os documentos, não os sem turma.~~ **Correção (revisão adversarial, achado Fix 2):
medido num Mongo de verdade, é o oposto.** O Mongoose serializa `{turmaId: undefined}` para
`{turmaId: null}`, que casa **só** quem NÃO tem turma — a visão do cursinho inteiro perderia todo
mundo COM turma, o que é pior do que a premissa original sugeria. Quando `turmaId` não vier, ele
tem que ficar **fora** do filtro — não entrar como `undefined` — e a guarda continua necessária,
só que pelo motivo contrário ao descrito aqui originalmente.

⚠️ **Índices no servidor, não só no schema.** Siga a lição da migração `0003`: `autoIndex` cria
índice novo mas não remove o que saiu do schema.

## Fora de escopo

- Agregado por questão — card `03`.
- Orquestração, hidratação de nome/matrícula e o `left join` com os estudantes — card `04`.
- Paginação — é da api, contra a lista de estudantes.
- Detalhe do estudante com respostas × corretas — card `07`.

## Critérios de aceite

- [ ] Devolve só as linhas daquele simulado e daquele cursinho
- [ ] Chamada sem `cursinhoId` é **recusada**, não interpretada como "todos"
- [ ] `turmaId` restringe à turma; sem ele, vem o cursinho inteiro
- [ ] `turmaId` ausente não vira filtro `undefined`
- [ ] Cada linha passa por `descreverFalha` — o teste afirma a **descrição**, não o código
- [ ] `aproveitamentoGeral` **ausente** (não zero) quando o status não é `completed`
- [ ] `totalEstudantesComCartaoNoCursinho` escopado no cursinho — teste provando que outro cursinho não
      entra na conta
- [ ] Teste com dois cursinhos e duas turmas, provando que não vaza entre eles
