# O agregado por questão

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/03-BACK-agregado-por-questao.md`
> Repo: `ms-simulado` · Branch: `feature/03-agregado-por-questao`
> Depende de: `02` (o mesmo recorte, ms **PR #193**)

---

## O pedido

> "um relatório por questão. Por exemplo, a questão 5, quantos usuários acertam, quantos erram e um
> percentual por resposta."

## Duas coisas que a investigação encontrou, e que encolhem o card

### 1. O "em branco" já chega normalizado — não precisa mexer no callback

O card manda *"descobrir primeiro o que o OMRChecker devolve para questão não marcada, e normalizar
isso na entrada, no callback"*. **Isso já acontece, um passo depois.**

`SimuladoService.processAnswer` mapeia **todas** as `simulado.questoes` e grava
`alternativaEstudante: resposta?.alternativaEstudante`. Quando o aluno não marcou, o `find` nas
`rawRespostas` não acha nada e o campo sai `undefined`.

Medido num Mongo de verdade, é isto que fica gravado:

```json
[{"questao":"…f2","alternativaEstudante":"A","alternativaCorreta":"A"},
 {"questao":"…f3","alternativaCorreta":"C"}]
```

A chave **não existe** na resposta em branco — não é `null`, não é string vazia. Um
`$ifNull: ['$respostas.alternativaEstudante', null]` no `$group` a identifica corretamente
(verificado: contou 1).

Ou seja: **toda questão do simulado tem uma linha em todo histórico concluído**, e a ausência de
marcação é representável sem nenhuma mudança de escrita.

### 2. `alternativaCorreta` está em cada resposta

A agregação não consulta gabarito nem cruza com a questão: `acerto = estudante === correta` sai da
própria linha.

---

## A decisão

### A rota

`GET /v1/relatorio-simulado/:simuladoId/questoes?cursinhoId=X[&turmaId=Y]`

Mesmo recorte do card `02`, mesma recusa quando `cursinhoId` não vem, mesma validação de
`:simuladoId`.

Por questão: `numero`, `questaoId`, `respondentes`, `acertos`, `erros`, `semLeitura`, e
`porAlternativa` — a contagem de cada uma de A–E.

### Contagens, não percentuais

⚠️ O card pede percentual e um teste *"para pegar arredondamento que soma 99% ou 101%"*. Devolver
contagem não **resolve** esse arredondamento — **elimina** a classe de bug. Contagem sempre fecha; a
tela divide e arredonda como precisar, e ainda pode mostrar percentual.

Devolver os dois seria dado redundante que pode divergir de si mesmo, e ainda exigiria escolher o
arredondamento.

### `semLeitura`, não `emBranco`

⚠️ **O sistema não sabe se o aluno deixou em branco ou marcou duas alternativas.** O
`cartao_reader.py:_estruturar_respostas` do ms-omr só emite questões cuja leitura é **uma** letra
A–E, descartando tanto `""` quanto `"AE"`. Os dois chegam indistinguíveis.

Chamar isso de "em branco" afirma algo que ninguém verificou — e é exatamente o número que o
professor vai usar para decidir o que revisar em aula. `semLeitura` é o que se sabe.

⚠️ **Card futuro:** distinguir branco de dupla marcação no ms-omr. Não bloqueia este card nem as
telas; muda o rótulo depois, não o cálculo.

### O número vem do Simulado, não do Histórico

A `Resposta` guarda o id da questão; o número vive em `simulado.questoes[].numero`
(`QuestaoNaContainer`). Sem ele o relatório fala de *"questão 65f3a…"* em vez de *"questão 5"*.

**Resolvido no serviço, não na agregação:** uma consulta do simulado, um `Map<questaoId, numero>`
aplicado ao resultado. Um `$lookup` aninhado dentro do array `questoes` para buscar um número custa
mais complexidade do que uma leitura de documento pequeno.

⚠️ `numero` é `number | null` — uma questão pode estar vinculada sem posição. Na prática um simulado
com questão sem número nunca é liberado (`todasNumeradas` em `simulado/helpers`), mas o código não
pode assumir: questão sem número vai para o fim da ordenação, não quebra.

Ordenação por `numero` ascendente — é como um professor lê.

### Calculado na hora

Decidido no card `08`, e **o motivo é corretude, não desempenho**: um agregado guardado discorda das
linhas exibidas exatamente quando o coordenador está subindo cartões em lote e recarregando a tela.

A escala não pede cache: 30 a 500 estudantes × 45 a 180 questões. Se um dia pedir, o precedente é
`cache.wrap` na api, como o `getSummary` já faz.

### `$lookup` + `$unwind`, e não `populate`

O card `02` usa `populate` porque só precisa de campos do topo do `Historico`. Aqui é preciso abrir
`respostas` e agrupar — trabalho que tem que acontecer **no banco**, não em memória depois.

```
$match    { simulado, cursinhoId [, turmaId] }
$lookup   historicos
$unwind   historico
$unwind   historico.respostas
$group    por respostas.questao
$sort     por questaoId (a ordem final por numero é aplicada no serviço)
```

---

## Riscos

⚠️ **Histórico não concluído não tem `respostas`**, e o `$unwind` descarta o documento. Isso é o
comportamento desejado — um cartão que falhou não vota em nenhuma questão — mas **é implícito**.
Um teste precisa fixar isso, senão uma mudança futura no `$unwind` (um `preserveNullAndEmptyArrays`
distraído) passaria a contar cartões falhos como respondentes de todas as questões.

⚠️ **`respondentes` é por questão, não do recorte.** Como toda questão tem linha em todo histórico
concluído, na prática os números coincidem — mas eles são conceitualmente diferentes, e o dia em que
uma questão for acrescentada a um simulado já respondido eles divergem. Contar por questão é o certo.

⚠️ **`acertos + erros + semLeitura` tem que bater com `respondentes`.** É a invariante que um teste
precisa afirmar diretamente, senão um erro no `$cond` some.

## Fora de escopo

- Percentuais — a tela divide.
- Distinguir branco de dupla marcação — card no ms-omr.
- Hidratação de enunciado, matéria ou frente da questão — os cards `05`/`06` decidem o que exibir; se
  precisarem, pedem ao ms pelo `questaoId`.
- Paginação — a lista é do tamanho do simulado, 45 a 180 itens.

## Critérios de aceite

- [ ] Por questão: `numero`, `respondentes`, `acertos`, `erros`, `semLeitura`, contagem por alternativa
- [ ] `acertos + erros + semLeitura === respondentes` — afirmado por teste
- [ ] Mesmo recorte do card `02`, e mesma recusa quando `cursinhoId` não vem
- [ ] `turmaId` restringe a agregação à turma
- [ ] Histórico não concluído não entra na conta — afirmado por teste
- [ ] Simulado sem nenhum cartão devolve lista vazia, não erro
- [ ] Questão sem `numero` não quebra a ordenação
- [ ] Teste contra Mongo real, como o do card `02` — a agregação é a parte que dublê nenhum prova
