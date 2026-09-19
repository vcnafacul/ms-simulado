# O vínculo cursinho/turma de uma resposta

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/08-PRODUTO-cartao-de-quem-nao-e-do-cursinho.md`
> Repos afetados: `ms-simulado` (coleção nova) · `api-vcnafacul` (resolve e envia o vínculo)
> Branch deste documento: `docs/08-decisao-vinculo-cursinho-turma`

**Este documento substitui o desenho dos cards `02`, `03` e `04`.** Eles foram escritos supondo que
a api resolveria uma lista de `userId` e a mandaria ao ms a cada consulta. Essa peça deixa de
existir.

---

## A pergunta do card

Os relatórios são recortados por turma ou por cursinho, mas o histórico grava só o `userId`. Três
situações sem resposta: o estudante que trocou de turma, o estudante sem turma, e o cartão de quem
não é do cursinho.

## O que a análise encontrou, e que muda a pergunta

### 1. A premissa de que o passado é irrecuperável é falsa

O card afirma: *"A turma da data não pode ser reconstruída depois — a informação não existe em lugar
nenhum."*

Existe. `student-course.service.ts:1127` (`updateClass`) é o **único** lugar do sistema que atribui
`student.class`, e toda atribuição grava um `LogStudent` com `createdAt` e
`description = "Atribuido a Turma: <nome> (<ano>)"`. O rastro cobre inclusive a atribuição inicial.

É texto livre, casado por **nome** e não por id — renomear uma turma quebra, homônimas no mesmo ano
ficam ambíguas — mas existe e é datado. Isso não elimina o caso de ter um campo próprio daqui pra
frente; elimina o argumento de urgência do card (*"cada dia sem o campo é mais cartão que nunca terá
essa informação"*).

### 2. A restrição arquitetural do contexto também é falsa

`00-CONTEXTO.md` afirma que o ms *"não conhece turma nem cursinho, e não pode passar a conhecer"*.

Ele já conhece cursinho: `simulado.schema.ts:47` e `prova.schema.ts:75` guardam `cursinhoId`, e a
`ProvaSchema` tem índice nele. O precedente foi aberto nas etapas 4 e 6. Guardar um id opaco de
cursinho no ms é o padrão da casa, não uma exceção.

---

## A decisão

Uma coleção de junção nova no ms-simulado:

```ts
RelatorioSimuladoEstudante {
  historico: ref,       // ↔ Historico
  simulado: ref,        // duplicado
  usuario: string,      // duplicado
  cursinhoId: string,
  turmaId?: string,
}
```

Índices: `{ simulado, cursinhoId }`, `{ simulado, turmaId }`, e único em `{ historico, cursinhoId }`.

A linha é criada **junto com o histórico**, nos dois pontos onde ele nasce, com o vínculo que a api
resolve naquele instante. Nada a reescrever depois: o relatório vira um retrato de uma data.

### Por que uma junção, e não campos no `Historico`

O `Historico` é a relação **usuário ↔ simulado**, e continua valendo para quem não tem cursinho
nenhum. Dois campos nulos ali seriam ruído na entidade errada — e `cursinhoId: null` ficaria ambíguo
entre *"esse usuário não tem cursinho"* e *"ainda não preenchemos"*. **Na junção, a ausência de linha
tem um significado só.**

De brinde: um usuário em dois cursinhos vira duas linhas, sem caso especial. E é reversível — dropar
a coleção não tira nada do `Historico`.

⚠️ O custo é uma segunda escrita. Se ela falhar, o histórico existe e não está em relatório nenhum.
É **recuperável**: o vínculo continua no MySQL, então uma reconciliação cria a linha faltante depois.
Mas o caminho de criação precisa logar a falha em vez de engolir — ver Riscos.

### Por que `simulado` e `usuario` são duplicados

Sem `simulado` na linha, toda consulta por simulado precisa de um join antes de filtrar. Sem
`usuario`, o card `04` não consegue responder quem **não** respondeu, que é metade do valor do
relatório para quem coordena. Os dois são imutáveis para um histórico, então duplicar não cria
divergência.

### Por que NÃO existe um pai `RelatorioSimuladoCursinho`

Foi avaliado e descartado. Um documento por (simulado, cursinho) com uma **lista** de refs seria uma
view materializada: append a cada cartão num documento compartilhado — com disputa entre uploads
simultâneos — e uma lista que pode divergir do conjunto de linhas que existe.

E não facilitaria a busca: `find({ simulado, cursinhoId })` **já é** o relatório, numa consulta. Com
o pai seriam duas — ler o pai, buscar as refs.

**O relatório não é uma coisa guardada. É uma consulta.**

### Agregados: calculados na hora

Aproveitamento geral e estatística por questão (card `03`) saem de uma agregação a cada pedido, não
de um campo guardado.

⚠️ **O motivo principal não é desempenho, é corretude.** O card `04` tem como critério *"o
aproveitamento agregado bate com a média das linhas exibidas"*. Um agregado guardado pode discordar
das linhas — e discorda exatamente quando o coordenador está subindo cartões em lote e recarregando
a tela. Ele veria 27 linhas e média de 24. Calculado na hora, essa classe de bug não existe.

A escala não pede cache: um cursinho tem de 30 a 500 estudantes e um simulado de 45 a 180 questões —
dezenas de milhares de subdocumentos, milissegundos de `$unwind` + `$group`. Se um dia ficar lento,
o conserto tem precedente na casa: `cache.wrap` na api, como já fazem `getSummary` e os
`aggregate-by-Period`. **Cache com TTL erra por um minuto; agregado guardado erra até alguém
perceber.**

### Sem backfill

Nenhuma linha é criada para históricos anteriores. O relatório vale dos novos em diante.

⚠️ **Consequência aceita: a tela nasce vazia**, inclusive para os cartões já enviados em produção. A
mitigação é de copy, não de dado — o estado vazio precisa dizer *"nenhum cartão registrado neste
recorte ainda"*, e não parecer uma tela quebrada. Sem isso, vira chamado.

---

## As três perguntas do card, respondidas

**1. Turma de hoje ou turma de quando respondeu?** → **De quando respondeu**, por construção: o
`turmaId` é gravado na criação e nunca reescrito. O relatório para de mudar sozinho depois de
fechado.

**2. Estudante sem turma?** → `turmaId` nulo. Ele aparece no relatório geral do cursinho e em nenhum
relatório de turma. O relatório geral mostra um aviso quando houver linhas sem turma — senão o
estudante some de toda visão por turma e ninguém descobre que ele existe.

**3. Cartão de quem não é do cursinho?** → Não gera linha, então não aparece. O relatório mostra a
**contagem** da diferença: *"27 de 30 cartões deste simulado pertencem a esta turma"*. Sem isso os
totais não fecham com o número de cartões enviados, e a leitura natural é "o sistema perdeu cartão".

⚠️ **Não liste os de fora, só conte.** São estudantes de outro cursinho, e o nome deles não é
informação que este relatório deva expor. A contagem sai de um `count` de `Historico` por simulado,
que não devolve nome nenhum.

---

## O que isso faz com os cards seguintes

| card | antes | agora |
|---|---|---|
| `02` | rota recebe lista de `userId`, obrigatória | rota recebe `cursinhoId` e opcionalmente `turmaId` |
| `03` | mesmo recorte por lista de usuários | mesmo recorte, pelo vínculo |
| `04` | resolve `StudentCourse` da turma → manda `userId`s ao ms | resolve cursinho pelo JWT e hidrata nome/matrícula |
| `05`/`06` | — | a tela de turma usa `turmaId`, filtrando no banco e não no navegador |

⚠️ **O `02` fica mais seguro, não só menor.** O card descrevia a lista de usuários obrigatória como
*"um vazamento esperando o dia em que alguém esquecer de passá-la"*. Ela deixa de existir: o ms passa
a impor o recorte sozinho, em vez de confiar numa lista que o chamador monta.

⚠️ **O `02` continua precisando chamar `descreverFalha`** (`historico/falha/mapa-falha.ts`, card
`01`) antes de devolver as linhas. Nada no código força isso.

---

## Riscos

⚠️ **São dois pontos de criação, não um.** `createPending` (`simulado.service.ts:168`, fluxo online)
e `createAwaitingOmr` (`cartao-historico.service.ts:35`, cartão). Esquecer um faz aquele fluxo inteiro
sumir dos relatórios em silêncio. **Ambos gravam a linha**, e a origem vira filtro de consulta em vez
de decisão de escrita — recortar depois é barato, recuperar o que não foi gravado não é.

⚠️ **A falha da segunda escrita não pode ser engolida.** Se a criação da linha falhar depois de o
histórico existir, registre em log com o `historicoId`, para a reconciliação ter por onde começar.
É a mesma lição dos cards `01b`/`01`: escrita que morre calada vira chamado que ninguém reproduz.

⚠️ **A api precisa resolver o vínculo nos dois fluxos.** No cartão é inequívoco — é o cursinho de
quem enviou. No online, sai do `StudentCourse` do próprio estudante; usuário sem `StudentCourse`
(público da plataforma) simplesmente não gera linha, que é o comportamento correto.

## Fora de escopo

- Reconstruir a turma do passado a partir do `log_student`. Possível e datado, mas casa por nome em
  texto livre e erra em silêncio. Card próprio, se algum dia alguém pedir.
- Um pai `RelatorioSimuladoCursinho` com agregados guardados. Só se aparecer necessidade concreta de
  metadado de relatório — e as linhas continuariam sendo a fonte.

## Checklist do card 08

- [x] Turma no momento da resposta: **sim**, via `turmaId` na junção
- [x] Campo criado **antes** dos cards `02` e `04` — é o card novo que este documento origina
- [x] Linhas do passado: não existem (sem backfill); o estado vazio precisa de copy honesta
- [x] Estudante sem turma: `turmaId` nulo, aparece no geral, com aviso
- [x] Contagem de "fora do recorte" no rodapé do relatório
