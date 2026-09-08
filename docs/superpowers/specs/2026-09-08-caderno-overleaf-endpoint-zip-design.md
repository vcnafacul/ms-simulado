# Card 04 · Endpoint, zip e o gate do rascunho

**POC:** Caderno · Overleaf · **Branch:** `feature/caderno-04-endpoint-zip` (de `poc/caderno-overleaf`)
**Card:** `docs/prova-latex-overleaf/cards/04-endpoint-zip.md` · **Depende de:** cards 02 e 03 (mergeados, PRs #178 e #179)

---

## O que é

Junta as peças e devolve o zip. Busca o simulado, aplica o portão, chama o gerador, resolve as
imagens, junta os avisos dos dois lados e empacota. Análogo ao `TemplateProvisionService.obterPdf` do
cartão-resposta, e mais simples, porque não compila nada.

É o primeiro card desta POC que o usuário final alcança.

## O endpoint tem UM portão, e é `simulado.bloqueado`

O card original pedia também um `422` para "nenhuma questão renderizável". **Sai.**

O endpoint não inspeciona propriedade interna do simulado para decidir se ele merece virar caderno.
Quem decide se um simulado pode ser considerado pronto é o fluxo que **calcula** `bloqueado`; auditar
isso aqui seria o caderno fiscalizando trabalho alheio — e mal, porque ele não tem como saber se
"zero questões" é defeito ou estado válido daquela categoria.

Isso também dissolve uma contradição com o card 02, que emite uma **questão-marcador** quando não há
questão elegível, justamente para o zip sempre compilar. Sem o `422`, o gerador emite o marcador, o
zip compila e o endpoint não opina.

⚠️ **Observação para outro fluxo, não para este card:** um simulado de categoria custom
(`quantidadeTotalQuestao: null`) e **sem nenhuma questão** passa nas duas checagens de
`simulado/helpers/bloqueado.ts` — `atingiuQuantidade(null, 0)` é `true` e `todasNumeradas([])` também.
Ou seja, ele fica **desbloqueado**. Se isso é defeito, é de quem calcula `bloqueado`. Registrado aqui
só para não se perder; o caderno **não** compensa por ele.

| Situação | Resposta |
|---|---|
| simulado inexistente | `404 'simulado não encontrado'` |
| `bloqueado === true` e sem `draft` | `409 'simulado não está pronto (questões pendentes ou incompletas)'` |
| `draft=true` com `CADERNO_DRAFT_ENABLED=false` | `403` |
| `QUESTAO_BUCKET` ausente | `503` |
| resto | `200` + zip |

⚠️ O `409` reusa `simulado.bloqueado` **direto**, sem recalcular e sem copiar a regra — mesma leitura
que o `TemplateProvisionService` já faz, e com a **mesma mensagem**, para as duas features não
divergirem em texto de erro.

⚠️ O `503` vem de o resolver do card 03 lançar quando falta `QUESTAO_BUCKET`. É a única exceção que
aquele módulo levanta, de propósito: seguir sem a variável transformaria toda imagem em "não
encontrada", que manda procurar a imagem em vez da configuração.

---

## Arquitetura

```
src/modules/caderno/
├── caderno.controller.ts     controller fino, no padrão do cartão-resposta
├── caderno.service.ts        portão → gerador → resolver → merge de avisos → zip
├── zip.ts                    monta o pacote (jszip)
├── nome-do-arquivo.ts        slug + timestamp
└── caderno.module.ts
```

```ts
@Injectable()
export class CadernoService {
  async gerarZip(
    simuladoId: string,
    opts: { draft: boolean },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }>;
}
```

### `SimuladoService.getById` já entrega o que o gerador precisa

Ele popula `categoria` e `questoes.questao` sem `select`, então os campos de texto vêm todos.

⚠️ E **não** traz `alternativa`, que tem `select: false` no schema. O gabarito continua fora por
construção, não por disciplina — o mesmo motivo pelo qual `QuestaoParaCaderno` não tem o campo.

---

## O merge dos avisos

É a lacuna que o gate do card 03 revelou, e este card é quem pode fechá-la.

O bloco `% AVISO:` no topo do `conteudo.tex` é escrito pelo **card 02**, que roda **antes** da
resolução das imagens. Os avisos do **card 03** — `imagem não encontrada no acervo`, `endereço de
imagem recusado`, `formato de imagem não suportado` — saem no retorno do resolver e hoje não são
escritos em lugar nenhum.

O `LEIA-ME.txt` já promete essas linhas, e já explica que uma caixa cinza no lugar da figura tem o
motivo numa delas. **A promessa está publicada e a entrega falta.**

Depois de resolver, o serviço reescreve o topo do `conteudo.tex` com as duas listas juntas, na mesma
sintaxe:

```latex
% AVISO: questão 47 — alternativa C está em branco
% AVISO: assets/03 — imagem não encontrada no acervo
```

⚠️ Reescrever o topo, não concatenar no fim: o `LEIA-ME` manda olhar o **topo do arquivo**, e um
segundo bloco lá embaixo seria pior que nenhum.

**Como, sem ambiguidade:** o `conteudo.tex` do card 02 ou começa com linhas `% AVISO:` seguidas de uma
linha em branco, ou começa direto no `\needspace`. A operação é: **remover o bloco de abertura**
(zero ou mais linhas consecutivas começando com `% AVISO:`, mais a linha em branco que as segue) e
prefixar o bloco novo com as duas listas na ordem — card 02 primeiro, card 03 depois.

Remover e reescrever, em vez de inserir no meio, evita o caso em que uma questão contém a string
`% AVISO:` no texto e a inserção acerta o lugar errado.

⚠️ O achatamento de `\n` (`umaLinhaSo`, card 02) vale para os avisos do card 03 também. Uma quebra de
linha encerra o comentário LaTeX e joga o resto impresso na prova.

---

## O zip

Raiz plana, com `assets/` como única subpasta:

```
main.tex           ← do repo, byte-a-byte
preambulo.tex      ← idem
logo.png           ← idem
LEIA-ME.txt        ← idem
conteudo.tex       ← gerado, com o bloco de avisos já unificado
metadados.tex      ← gerado
assets/01.png …    ← resolvidas pelo card 03
```

Os `\input{...}` e o `\includegraphics{logo.png}` do template resolvem relativo ao `main.tex`.

⚠️ **Importe `TEMPLATE_DIR` e `ARQUIVOS_DO_ZIP` de `modules/caderno/templates.ts`.** Não recalcule
`path.join(__dirname, 'templates/v1')`: daqui ele resolveria para outro lugar, e o teste do card 00
**não pegaria** — o `__dirname` dele é o do próprio spec.

### `jszip`

Primeira dependência nova desta POC. Pura JS, sem binário nativo, e monta o zip em memória — uma prova
de 90 questões com ~100 imagens dá algo como 12 MB, que cabe folgado.

O motivo de não escrever à mão: um zip STORE é formato simples, mas offset ou CRC errado produz um
arquivo que só falha **no Overleaf**, longe do teste, e o gate desta POC é manual.

### Nome do arquivo

`<slug>-<timestamp>.zip`, por exemplo `simuladao-de-novembro-20260908-1432.zip`.

Slug: minúsculas, sem acento, `[a-z0-9-]`, colapsando hífens. **Fallback para o `simuladoId`** se o
nome sanear para vazio — nome de simulado aceita acento, barra e dois-pontos, e nem todo sistema de
arquivos aceita.

O timestamp **não versiona nada no servidor**: não guardamos zip, cada requisição regenera. Ele existe
para o download não virar `caderno (1).zip`, `caderno (2).zip` na máquina de quem baixou.

Vai no `Content-Disposition`.

### `X-Caderno-Avisos`

O total somado dos dois cards, para o client mostrar um aviso sem abrir o zip.

---

## Env

```
CADERNO_DRAFT_ENABLED=true
```

No schema Zod, o default é calculado na carga do módulo:

```ts
CADERNO_DRAFT_ENABLED: z.coerce
  .boolean()
  .default(process.env.NODE_ENV !== 'production'),
```

⚠️ `z.coerce.boolean()` trata **qualquer string não vazia como `true`**, inclusive `"false"`. Se a
variável vier do ambiente como texto, use uma transformação explícita (`z.enum(['true','false'])` ou
`.transform((v) => v === 'true')`) — senão desligar a flag em produção não desliga nada, e o defeito é
invisível até alguém baixar um caderno que não devia existir.

Default `true` fora de produção, `false` em produção — rascunho é ferramenta de quem monta a prova, e
em produção liberar isso por acidente entregaria caderno de simulado incompleto.

---

## Observabilidade

Um log por geração, com: `simuladoId`, `draft`, questões incluídas, imagens, `doCache`/`doBucket`/
`daInternet` do card 03, bytes do zip, duração e nº de avisos.

⚠️ As métricas do card 03 são a medição que decide o card 07 (cache do artefato) e a volta do Redis.
Sem elas no log, aquela decisão vira chute de novo.

---

## Testes

**`CadernoService`, com gerador/resolver/storage mockados:**

- simulado inexistente → `NotFoundException`
- `bloqueado: true` sem draft → `ConflictException`, com a **mesma mensagem** do cartão-resposta
- `bloqueado: true` com `draft=true` e flag ligada → gera
- `draft=true` com flag desligada → `ForbiddenException`, **mesmo com o simulado pronto**
- `bloqueado: false` → gera, sem olhar mais nada
- simulado sem questão elegível e desbloqueado → **gera** (o marcador do card 02), não lança
- o resolver lançando por `QUESTAO_BUCKET` ausente vira `ServiceUnavailableException`
- `draft` é repassado ao gerador (rascunho gera `\cadernoRascunhotrue`)

**Merge de avisos:**

- avisos do card 02 e do card 03 aparecem juntos, no topo do `conteudo.tex`
- só avisos do 03 → o bloco existe mesmo assim
- nenhum aviso → não há bloco
- aviso do 03 com `\n` vira uma linha só
- `X-Caderno-Avisos` bate com a soma

**Zip:**

- contém os quatro arquivos do template, **byte-idênticos** ao repo
- contém `conteudo.tex` e `metadados.tex` gerados
- as imagens ficam em `assets/`, e nada mais fica
- não contém `exemplo/` — o smoke test do card 00 não pode vazar para a prova do aluno
- abre com `JSZip.loadAsync` e a árvore bate

**Nome do arquivo:**

- `Simulão de Novembro!` → `simulao-de-novembro`
- nome só de símbolos → cai no `simuladoId`
- o timestamp muda entre duas chamadas
- só `[a-z0-9-]` no resultado

## Critérios de aceitação

- [ ] Todos os testes acima
- [ ] Cobertura ≥ 90% no módulo
- [ ] `CadernoModule` no `AppModule` sem ciclo de dependência
- [ ] `.env.example` com `CADERNO_DRAFT_ENABLED`
- [ ] `yarn build` gera `dist/main.js` na raiz
- [ ] A suíte do `cartao-resposta` passa sem alteração

## Gate

Manual, e é **o critério principal do card**: o zip baixado do endpoint, subido no Overleaf como
projeto novo, compila **sem edição manual**.

Desta vez com um simulado de verdade da homologação, não fixture. O que olhar: a estrutura do zip, o
bloco `% AVISO:` unificado no topo do `conteudo.tex`, a marca d'água só no rascunho, e a segunda
chamada visivelmente mais rápida.

⚠️ Precisa de `QUESTAO_BUCKET` configurado — ele não existe em nenhum ambiente ainda. Sem ele o gate
testa só o caminho de URL externa, e o `origem: 'r2'` fica sem prova de leitura bem-sucedida.

## Risco

**Baixo.** Sem compilação, sem binário, sem sandbox. O que sobra:

1. **`jszip` produzindo algo que o Overleaf recuse** — improvável, e o gate mata.
2. **`QUESTAO_BUCKET` ausente**, que é infraestrutura e não código.
3. **O merge de avisos reescrevendo o `conteudo.tex` errado** — daí o teste de que o bloco fica no
   topo e a asserção de uma linha por aviso.
