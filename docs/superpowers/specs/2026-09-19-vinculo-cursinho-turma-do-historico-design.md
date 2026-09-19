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

Índices: `{ simulado, cursinhoId }`, `{ simulado, turmaId }`, e único em
`{ simulado, cursinhoId, usuario }`.

A linha é **registrada** (upsert, não `create`) junto com o histórico do cartão, com o vínculo que a
api resolve naquele instante. Nada a reescrever depois: o relatório vira um retrato de uma data.

⚠️ **Correção sobre a versão original deste documento**: a chave única foi desenhada primeiro como
`{ historico, cursinhoId }`, supondo uma linha por *tentativa*. Uma revisão adversarial derrubou essa
suposição: **todo** reenvio de cartão — inclusive o reenvio pedido pelo produto depois de uma falha de
OCR (*"Refotografe"*) — cria um `Historico` novo via `createAwaitingOmr`. Com a chave por histórico,
esse reenvio nascia como uma **segunda linha**, e o estudante aparecia duas vezes no relatório (uma
falha, uma concluída) — o índice não protegia nada, porque a chave nunca colidia consigo mesma.

O grão certo é o **estudante** dentro de um simulado e cursinho, não a tentativa: uma linha por
`{ simulado, cursinhoId, usuario }`, sempre apontando para o `Historico` **atual**. A escrita deixou de
ser um `create` e passou a ser um `updateOne(..., { upsert: true })` — um reenvio atualiza a linha
existente para o histórico novo, em vez de criar outra.

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

### Só o fluxo de cartão gera linha

⚠️ **Decisão explícita.** O simulado resolvido **digitalmente** pelo estudante logado **não** gera
linha. Ele entra no histórico pessoal e aparece no relatório genérico que já existe — e **esse
relatório não é tocado por nenhum card desta série**.

Consequência: há **um** ponto de escrita, `createAwaitingOmr` (`cartao-historico.service.ts:35`), e
não dois. O `createPending` do fluxo online fica intacto.

⚠️ O preço é que, se um dia alguém quiser resultados online no relatório do cursinho, as linhas do
passado não existirão. Aceito: o online já tem relatório próprio, e resolver `StudentCourse` a cada
resposta online seria custo num caminho quente para gravar dado que ninguém lê.

### Sem backfill

Nenhuma linha é criada para históricos anteriores. O relatório vale dos novos em diante.

⚠️ **E isso quase não custa nada**, porque o cartão-resposta **ainda não subiu para produção** — está
só em homologação, e a série inteira sobe junto como feature nova. Não há cartão em produção para
ficar de fora. Em homol, o que existir de teste some do relatório; se incomodar, é mais barato
reenviar os cartões de teste do que escrever um script.

Ainda assim, o estado vazio precisa de copy honesta — *"nenhum cartão registrado neste recorte
ainda"* — e não uma tela que pareça quebrada.

---

## As três perguntas do card, respondidas

**1. Turma de hoje ou turma de quando respondeu?** → **De quando respondeu**, por construção: o
`turmaId` é gravado na criação e nunca reescrito. O relatório para de mudar sozinho depois de
fechado.

**2. Estudante sem turma?** → `turmaId` nulo. Ele aparece no relatório geral do cursinho e em nenhum
relatório de turma. O relatório geral mostra um aviso quando houver linhas sem turma — senão o
estudante some de toda visão por turma e ninguém descobre que ele existe.

**3. Cartão de quem não é do cursinho?** → ♻️ **A pergunta ficou sem objeto.** O card `08b` fez o
upload resolver o `cursinhoId` pelo JWT de quem envia e recusar, com **403**, estudante que não seja
daquele cursinho (`cartao-upload.service.ts:82`). Não existe mais linha cujo cursinho o estudante não
pertença, nem cartão de admin sem cursinho.

O que sobra é o **item 2** — aluno de outra turma ou sem turma dentro do mesmo cursinho. Para isso o
relatório por turma mostra no rodapé *"27 dos 30 cartões deste simulado são desta turma"*, com o
total vindo de `countDocuments({ simulado, cursinhoId })` — **escopado pelo cursinho do JWT, nunca
global**. No relatório geral do cursinho esse número é sempre igual ao de linhas, e a tela não o
mostra.

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

⚠️ **Um ponto de criação: `createAwaitingOmr`** (`cartao-historico.service.ts:35`). O
`createPending` (`simulado.service.ts:168`, online) **não** grava linha — ver a decisão acima. Quem
mexer nesse arquivo depois precisa saber que a omissão é deliberada, e não esquecimento.

⚠️ **A falha da segunda escrita não pode ser engolida.** Se a criação da linha falhar depois de o
histórico existir, registre em log com o `historicoId`, para a reconciliação ter por onde começar.
É a mesma lição dos cards `01b`/`01`: escrita que morre calada vira chamado que ninguém reproduz.

⚠️ **A api resolve o vínculo no upload do cartão**, onde ele é inequívoco: é o cursinho de quem
enviou, que a api já resolve pelo JWT (`CursinhoResolverService`) no `cartao-resposta-resultados`
logo ao lado. A turma sai do `StudentCourse` do estudante naquele instante.

## Fora de escopo

- Reconstruir a turma do passado a partir do `log_student`. Possível e datado, mas casa por nome em
  texto livre e erra em silêncio. Card próprio, se algum dia alguém pedir.
- Um pai `RelatorioSimuladoCursinho` com agregados guardados. Só se aparecer necessidade concreta de
  metadado de relatório — e as linhas continuariam sendo a fonte.

## Checklist do card 08

- [x] Turma no momento da resposta: **sim**, via `turmaId` na junção
- [x] Campo criado **antes** dos cards `02` e `04` — é o card novo que este documento origina
- [x] Linhas do passado: não existem (sem backfill) — e não custa, porque o cartão ainda não está
      em produção; o estado vazio precisa de copy honesta
- [x] Estudante sem turma: `turmaId` nulo, aparece no geral, com aviso
- [x] Contagem de "fora do recorte" no rodapé do relatório
