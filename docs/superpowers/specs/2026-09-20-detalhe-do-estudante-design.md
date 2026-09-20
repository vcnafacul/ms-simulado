# O detalhe do estudante: o que ele marcou × o que era correto

> Card de origem: `vcnafacul-3/docs/cards/relatorio-simulado-cursinho/07-FRONT-detalhe-do-estudante.md`
> Repos: `ms-simulado`, `api-vcnafacul`, `client-vcnafacul` · Branch nos três: `feature/07-detalhe-do-estudante`
> Depende do `04` e do `06`, os dois **mergeados**.

---

## O pedido

> "Quando eu clicar em visualizar sobre o estudante, aí eu poderia ver quais resposta ele deu e qual
> era a correta."

## ⚠️ O card se dizia só de client, e não é

O cabeçalho do card diz `Repo: client-vcnafacul`. **Falso**, e por uma razão que o próprio card
antecipou sem tirar a conclusão: as `respostas` são **deliberadamente excluídas** da projeção da
junção (`CAMPOS_DO_HISTORICO` em `relatorio-simulado-estudante.repository.ts:15`), com o comentário
dizendo que *"90 questões × centenas de estudantes é carga que nenhuma delas lê — o card 07 busca o
histórico por id quando precisar do detalhe"*.

Então o detalhe precisa de uma busca própria, e ela precisa de rota.

## ⚠️ E a rota genérica que o card cogitou reusar está aberta

O card mandava *"confirme quem pode chamar `GET /mssimulado/historico/:id`"*. Confirmado, e é pior do
que ele temia.

`historico.controller.ts:56-65` recebe o id e **não injeta `req.user`**; o service
(`historico.service.ts:35-37`) é passthrough puro para `v1/historico/${id}`. Não há checagem de dono
em lugar nenhum do caminho. **Qualquer usuário autenticado — inclusive um estudante — lê o histórico
de qualquer outro pelo id.**

Os dois vizinhos no mesmo controller (`getAllByUser`, `getPerformance`) **escopam** por
`(req.user as User).id`. O `getById` é o fora da curva.

**Isso é defeito vivo, independente deste card, e virou o card `11`.** Este card não o conserta e não
depende dele: constrói rota própria, como o card original propôs.

---

## O contrato

### ms-simulado

`GET /v1/relatorio-simulado/:simuladoId/estudante/:usuario?cursinhoId=X`

⚠️ **O gate é o próprio filtro, e isso não é economia — é o desenho.** A junção tem índice **único**
em `{simulado, cursinhoId, usuario}`. Buscar pelos três é uma leitura indexada que **já não encontra
nada** para estudante de outro cursinho. Não há checagem separada que alguém possa esquecer de
escrever, nem um caminho em que o dado alheio entra no processo antes de ser recusado.

Sem linha → **404**, não lista vazia: a tela pediu um estudante específico e ele não está neste
recorte.

Devolve: `status`, `falha` (já descrita pelo `descreverFalha`, como no card `02`), e `respostas[]`
com `numero`, `questaoId`, `alternativaEstudante`, `alternativaCorreta`.

⚠️ **O `numero` vem do Simulado, não da Resposta**, pelo mesmo `Map` do card `03` — sem ele o
professor lê *"questão 65f3a…"* em vez de *"questão 5"*.

⚠️ **Aqui as `respostas` ENTRAM na projeção**, ao contrário do `CAMPOS_DO_HISTORICO`. É um estudante,
não centenas: a razão que excluiu o campo lá não vale aqui.

### api-vcnafacul

`GET /mssimulado/relatorio/simulado/:simuladoId/estudante/:userId`

Proxy fino no módulo do card `04`: `gerenciarEstudantes`, `cursinhoId` **sempre do JWT**.

⚠️ **Sem hidratação do MySQL.** O nome do estudante a tela já tem — é a linha que ela clicou. Buscar
de novo seria uma consulta para repetir o que já está na mão.

⚠️ **Colisão de rota:** `:simuladoId/estudante/:userId` tem três segmentos, como
`simulados/turma/:turmaId`. Elas **não** colidem de verdade (o segundo segmento é literal e diferente:
`estudante` × `turma`), mas as literais continuam declaradas antes, e o teste que sobe o app cobre as
duas — é a classe de defeito que nasce no roteamento e que teste de unidade não pega.

---

## A tela

**Modal sobre o relatório.**

⚠️ **Não rota, ao contrário do relatório.** As três razões que fizeram o `06` ser rota — link,
impressão, profundidade — são bem mais fracas aqui: ninguém manda "olha a prova do fulano" com a
frequência com que manda o relatório da turma. E o custo de sair é concreto e já foi pago uma vez: o
relatório tem ordenação e aba, e navegar para fora obrigaria a repetir o `location.state` do card
`05`, mais uma terceira entrada no `EstadoDeVolta`. O coordenador está **varrendo** a lista; abrir um
aluno é um detalhe que se fecha e continua.

### O conteúdo

Uma linha por questão: **número**, **o que marcou**, **o que era correto**, **o resultado**.

⚠️ **Cor não pode ser o único portador.** Certo/errado só por verde e vermelho exclui quem não
distingue as duas. Símbolo **ou** texto junto, sempre. E as medições do `tokens.ts` valem: `green3` dá
3.77:1 e `red` 3.88:1 sobre branco — passa para **componente gráfico**, não para texto pequeno.

⚠️ **Em branco não é erro.** Três estados, não dois: acertou, errou, **sem leitura**.

⚠️ **E o rótulo é "sem leitura", não "em branco"** — a mesma decisão do card `03`, pelo mesmo motivo
medido: o `cartao_reader.py` do ms-omr só emite questão cuja leitura é **uma** letra A–E, descartando
`""` e `"AE"` igualmente. Branco e dupla marcação chegam **indistinguíveis**. Chamar de "em branco"
afirma o que ninguém verificou — e é o número que o professor usa para decidir o que revisar.

**Como se reconhece:** a chave `alternativaEstudante` **não existe** na resposta sem leitura — não é
`null`, não é string vazia. Medido no card `03`, em BSON real.

### Quando não há o que mostrar

- **`failed`** → a **descrição do erro** do card `01`, não uma tabela vazia. É a informação acionável.
- **`awaiting_omr` / `pending` / `processing`** → diz que ainda está processando.
- ⚠️ **`completed` que ainda carrega `falha` antiga não mostra o motivo** — mesma armadilha que o card
  `06` fechou: `marcarFalha` é o único escritor de `falha` e **nada nunca a desfaz**.

## Fora de escopo

- **O enunciado da questão.** Não está no pedido, e exigiria buscar a questão e renderizar
  markdown/LaTeX. Se for desejado, card próprio.
- Matéria e frente por questão — mesma razão.
- O gate do `GET /mssimulado/historico/:id` — card `11`.

## Riscos

**Duplicata de questão: não é preocupação aqui.** A corrida do `adicionarEmProva` (bug da Etapa 11)
pode em tese deixar a mesma questão duas vezes num simulado, e aí ela apareceria duas vezes nesta
tabela. **Risco tratado como desprezível, por decisão:** criar simulado passa por validação e
diagramação, com gente trabalhando sobre a prova pronta — uma questão repetida seria vista antes de o
simulado existir. Não é zero, mas as validações humanas o deixam baixo o bastante para não pagarmos
complexidade em toda consulta. Nada a compensar na tela; a causa se conserta no card da Etapa 11.

⚠️ **Questão sem número não some da lista** — vai para o fim, como no `03`. Sumir seria pior que
aparecer fora de ordem: o professor não saberia que ela existe.

## Critérios de aceite

- [ ] Uma linha por questão, com marcada, correta e o resultado
- [ ] **Sem leitura** distinguível de erro — três estados, não dois
- [ ] Certo/errado **não depende só de cor**
- [ ] Histórico `failed` mostra a descrição do erro, não tabela vazia
- [ ] Histórico `awaiting_omr` diz que está processando
- [ ] `completed` com `falha` residual **não** mostra o motivo
- [ ] Estudante de outro cursinho dá **404**, e a leitura já não o encontra — teste de isolamento
- [ ] `cursinhoId` obrigatório no ms; na api vem do JWT e nenhum parâmetro o troca
- [ ] Questão sem número vai para o fim, não some
- [ ] **Teste que sobe o app** nos dois backends, cobrindo a rota nova junto das existentes
- [ ] Teste contra Mongo real, como os cards `02`/`03`/`04b`
