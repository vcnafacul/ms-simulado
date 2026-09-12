# Card 11 · O zip da prova usa o template publicado, e o zip de teste

**Etapa:** Caderno · Overleaf · **Branch:** `feature/caderno-11-zip-template-publicado` (de `develop`)
**Card:** `docs/prova-latex-overleaf/cards/11-zip-usa-template-publicado.md` · **Bloqueia:** card 12
**Bloqueado por:** cards 04 e 10 (os dois mergeados)

---

## O que é

Duas mudanças ligadas:

1. O zip da prova monta `main.tex` e `preambulo.tex` a partir da **versão publicada no Mongo**, em vez
   de ler do `dist`.
2. Um endpoint novo entrega um **zip modelo**: mesmo template, conteúdo fabricado. É o ponto de partida
   para editar no Overleaf e é como se confere uma versão antiga antes de restaurá-la.

O card 10 pôs o template no Mongo e ninguém lê de lá. Este card fecha esse circuito — e é o que faz
"editar a capa sem deploy" virar verdade em vez de promessa.

---

## O que foi verificado antes de escrever

| premissa | medido |
|---|---|
| `CadernoTemplateModule` exporta o serviço | ✅ exportado no card 10 exatamente para isto |
| `montarZip` só tem um consumidor | ✅ `caderno.service.ts` |
| `porVersao` existe | ✅ no repositório; **falta** passthrough no serviço |
| `exemplo/` só é referenciado em dois lugares | ✅ `templates.spec.ts` e um comentário no `preambulo.tex:45` |
| `zip.spec.ts` depende de `ARQUIVOS_DO_ZIP` | ✅ linhas 4 e 42 — a asserção de bytes idênticos muda |
| `exemplo/figura.png` existe | ❌ **não existe**, e `exemplo/` é excluído do `dist` |
| o `logo.png` chega ao `dist` | ✅ pelo glob `templates/**/*.png` |

---

## 1. O zip da prova troca a fonte de leitura

`montarZip` hoje lê os quatro arquivos de `TEMPLATE_DIR`. Passa a receber os dois `.tex` como texto:

```ts
export interface PacoteDoCaderno {
  /** `main.tex` e `preambulo.tex`, da versão publicada no Mongo */
  template: Record<string, string>;
  conteudo: string;
  metadados: string;
  imagens: ArquivoDoZip[];
}
```

`ARQUIVOS_DO_ZIP` se parte em dois:

| constante | conteúdo | de onde vem |
|---|---|---|
| `ARQUIVOS_DO_TEMPLATE` | `main.tex`, `preambulo.tex` | Mongo |
| `ARQUIVOS_DO_REPO` | `logo.png`, `LEIA-ME.txt` | `dist` |

⚠️ **`montarZip` recusa se faltar um dos dois `.tex`.** O lint do card 10 e a extração garantem que
uma versão publicada tem os dois, mas se algum dia não tiver, o zip sai com um arquivo só e o LaTeX
para com `File not found` — a pessoa recebe um zip que não compila e nada dizendo por quê. Uma
verificação de duas linhas troca isso por uma mensagem que nomeia o arquivo ausente.

`CadernoService` injeta `CadernoTemplateService`, chama `publicada()` e acrescenta `template=<versao>`
na linha de log.

**O 503 vem de graça:** `publicada()` já lança `ServiceUnavailableException` quando não há versão
publicada, decidido no card 10. Não há fallback ao disco a escrever nem a testar aqui — ele não existe
por construção, e é o que impede o admin de achar que sua edição está no ar enquanto o PDF sai com o
template antigo.

**Sentido único no grafo de módulos:** `CadernoModule` → `CadernoTemplateModule`. Sem ciclo, porque
`gerarCaderno` e `montarZip` são funções puras, não providers.

### Por que a `versao` no log não é enfeite

Quando alguém disser "a prova saiu torta", a primeira pergunta é qual versão do template gerou. Sem
isso a resposta exige adivinhar pela data, contra um histórico que muda sem deploy — ou seja, sem
nenhum rastro no git.

---

## 2. O zip de teste

`GET /v1/caderno/template/teste`, no controller do card 10.

| chamada | usa |
|---|---|
| `GET /template/teste` | a versão **publicada** |
| `GET /template/teste?versao=3` | a **v3** (conferir antes de restaurar) |
| `GET /template/teste?rascunho=1` | o **rascunho** pendente |

**Os dois parâmetros juntos → `400`.** E `?rascunho=` com qualquer valor que não seja `1` ou `true`
→ **`400`**, em vez de cair calado na publicada. Este projeto já se queimou com `z.coerce.boolean()`
tratando `"false"` como `true`; devolver a versão errada em silêncio é o defeito exato que o endpoint
existe para evitar. `?versao=` não numérico → `400`.

⚠️ `versao` é query **opcional**: um `ParseIntPipe` cru rejeita a ausência junto com o lixo, e a ausência é o caso normal (usa a publicada). A validação só roda quando o parâmetro veio.

Versão inexistente → `404`. Sem rascunho → `404`.

**O endpoint não escreve nada.** Uma versão anterior do card gravava `testadoEm` no rascunho a cada
download; isso saiu quando o fluxo passou a incluir o Overleaf por construção.

### O mock é de domínio, não arquivo estático

O endpoint monta um simulado falso **em memória** e roda **o gerador de verdade**. Isso faz o teste
validar *template + gerador atuais juntos*: se o gerador mudar de molde, o mock acompanha de graça.

Seis blocos, escolhidos pelo que costuma quebrar layout:

| # | o que exercita |
|---|---|
| 46 | texto curto, alternativas curtas |
| 47 | enunciado longo, 2 parágrafos — quebra de coluna |
| 48 | fórmula inline e display |
| 49 | imagem no enunciado — `max width=\linewidth` em duas colunas |
| 50 | alternativas longas, uma com 3 linhas |
| 51 | **alternativas sem texto** — o caso dominante do acervo, que gera a caixa cinza de aviso |

A numeração começa em 46 de propósito: é o segundo dia do ENEM, e foi justamente onde um bug de
`faltantes` apareceu no card 02.

### A marca d'água sai do gerador, não de um `\def`

⚠️ **O card sugere `\cadernoRascunho{true}`, e isso não funciona.** `\cadernoRascunho` é um `\newif`:
liga com `\cadernoRascunhotrue`, e a forma com `\def` **não liga nada e não dá erro** — a marca d'água
simplesmente não aparece. Está medido e comentado em `gerar-caderno.ts:100-103`.

Rodando o gerador com `{ draft: true }` isso vem certo sozinho. É mais um argumento para o mock de
domínio: a forma errada é a que uma pessoa escreveria à mão.

⚠️ **O zip de teste é sempre draft, independente de `CADERNO_DRAFT_ENABLED`.** Aquele gate mora no
`CadernoService.gerarZip` e protege a geração de prova a partir de simulado incompleto — outra coisa.
Aqui a marca d'água é a garantia de que um zip de teste não seja confundido com uma prova, e ela não
pode depender de flag de ambiente.

O título do simulado falso é `TEMPLATE DE TESTE — NÃO APLICAR`, e vira `\cadernoTitulo` pelo caminho
normal do gerador.

⚠️ **A categoria falsa usa `quantidadeTotalQuestao: null`.** Medido em `gerar-caderno.ts:146-167`: com
um alvo numérico, o modo draft calcula `faltantes` a partir do menor número presente — com seis
questões começando em 46 e um alvo de 90, o zip de teste sairia anunciando 84 pendências que não
existem. `null` é categoria de quantidade livre, e não há o que faltar.

### A imagem, sem rede, sem R2 e sem Redis

O endpoint **não** usa o `ResolverDeImagens`. Ele resolve a única imagem do mock a partir de um PNG
commitado, lido do disco.

⚠️ **A referência do mock usa `asset://`, não `https://`.** Se algum dia alguém ligar o resolvedor real
aqui por engano, `asset://` bate no R2 e dá 404 — enquanto `https://` faria um endpoint de teste emitir
requisição de saída. É também o esquema que o acervo passa a usar depois do card 08.

⚠️ **O card diz `assets/exemplo.png`, e vai sair `assets/01`.** O `ColetorDeImagens` numera sozinho e
emite o caminho **sem extensão** de propósito — quem nomeia com extensão é quem abre os bytes. Sigo o
gerador; o card está desatualizado nesse detalhe.

A figura é um PNG pequeno e **obviamente sintético** — nada que possa ser confundido com material
de prova. Ela existe para exercitar `max width=\linewidth` numa coluna de 8 cm, não para ilustrar
coisa nenhuma.

**A figura mora ao lado do código que a usa**, com glob próprio no `nest-cli.json`, copiando o
precedente que já funciona do `imagens/imagem-indisponivel.png`. Não vai em `templates/v1/exemplo/`,
que é **excluído** do `dist` — lá ela não chegaria em produção e o endpoint quebraria só dentro do
container.

⚠️ Não reusar o `imagem-indisponivel.png`: ele é a caixa cinza que significa **falha**, e o `LEIA-ME`
explica isso. Usá-lo como imagem bem-sucedida faria o coordenador achar que o teste quebrou.

---

## 3. O `exemplo/` sai

Somem o diretório, o `exclude` dos três globs do `nest-cli.json` e quatro testes do `templates.spec`.

O argumento é o do próprio card: fixture estático desatualiza em silêncio. O `exemplo/conteudo.tex`
**já carrega esse aviso**, porque foi escrito quando existia um conversor de markdown que não existe
mais. O mock gerado não tem como envelhecer sozinho.

⚠️ **Mas `tabularx`, `booktabs`, `enumitem` e `ulem` ficam no `preambulo.tex`.** Só muda o comentário
da linha 45, que hoje diz "usados pelo exemplo/". Eles passam a existir para quem editar o template no
Overleaf. Remover pacote que o coordenador pode querer, para limpar quatro linhas de peso morto, é
piorar a vida dele sem ganho nenhum. O teste do `ulem` com `[normalem]` continua valendo, e continua
sendo o que impede o sequestro silencioso do `\emph`.

### Os `.tex` continuam indo para o `dist`

Eles deixam de ser lidos em runtime, mas tirá-los dos globs quebraria a invariante do `templates.spec`
— "toda extensão do nível de topo está coberta por um glob" — que é o que protege o **próximo** arquivo
que alguém puser ali (uma `.sty`, uma `exam.cls` vendorizada). O card diz que os critérios de `dist` do
card 00 encolhem, não que somem: `logo.png` e `LEIA-ME.txt` seguem obrigatórios.

---

## 4. O `LEIA-ME.txt` passa a mentir, e isso é escopo deste card

Ele viaja dentro de **toda prova gerada** e hoje diz, nas linhas 28-30:

> Se a mudança deve valer para todo mundo, daqui em diante, ela precisa voltar para o repositório do
> ms-simulado num pull request. A fonte da verdade do template é o repo; este projeto é descartável.

Depois deste card as duas frases são falsas. E o efeito é o oposto do que a etapa inteira busca: o
coordenador edita o layout, lê o arquivo que veio junto, e vai pedir um PR a um desenvolvedor —
exatamente o atrito que os cards 10 a 13 existem para remover.

Há um teste fixando essa redação (`o LEIA-ME diz como tornar uma mudança de layout permanente`,
casando `/reposit[óo]rio|repo\b/`), então a correção é nos dois lugares.

⚠️ **A redação nova precisa ser verdadeira também na janela entre o card 11 e o card 13**, quando
ainda não existe tela de upload. Por isso ela aponta para *a versão publicada na plataforma* como fonte
da verdade e manda falar com quem administra a plataforma — verdadeiro antes e depois de a tela
existir, sem prometer um botão que ainda não há.

---

## Estrutura de arquivos

```
src/modules/caderno/
├── templates.ts                    ARQUIVOS_DO_TEMPLATE + ARQUIVOS_DO_REPO
├── zip.ts                          montarZip recebe o template pronto
├── caderno.service.ts              injeta o serviço do template, loga a versão
├── caderno.module.ts               importa CadernoTemplateModule
└── templates/v1/
    ├── LEIA-ME.txt                 a fonte da verdade é a plataforma
    ├── preambulo.tex               só o comentário da linha 45
    └── exemplo/                    REMOVIDO

src/modules/caderno/template/
├── caderno-template.service.ts     + porVersao
├── caderno-template.controller.ts  + GET /teste
├── caderno-template.module.ts      inalterado — o zip de teste é função pura
└── teste/
    ├── simulado-de-teste.ts        o simulado falso, puro
    ├── figura-exemplo.ts           CAMINHO + leitura, molde do placeholder.ts
    ├── figura-exemplo.png          a figura da questão 49
    └── zip-de-teste.ts             gerador + figura + montarZip
```

`nest-cli.json` ganha `modules/caderno/template/teste/*.png` e perde os três `exclude`.

---

## Testes

**Puros:**
- `montarZip` leva os dois `.tex` recebidos, e **não** os do disco — o teste passa um template
  diferente do repo e confere que é ele que sai no zip
- `montarZip` sem `main.tex` ou sem `preambulo.tex` → lança nomeando o que faltou
- `logo.png` e `LEIA-ME.txt` continuam byte-idênticos ao repo
- o simulado de teste gera 6 blocos, uma imagem, e o aviso da questão 51

**Com mock:**
- `CadernoService` chama `publicada()` e o 503 propaga
- a linha de log contém `template=<versao>`
- o endpoint: sem parâmetro usa a publicada; `?versao=3` usa `porVersao(3)`; `?rascunho=1` usa
  `rascunho()`; os dois juntos → 400; `?rascunho=xis` → 400; `?versao=abc` → 400
- versão inexistente → 404; sem rascunho → 404
- **o endpoint não escreve**: nenhum método de escrita do repositório é chamado

**Do zip de teste, sem infra nenhuma:**
- o zip abre e tem `main.tex`, `preambulo.tex`, `logo.png`, `LEIA-ME.txt`, `conteudo.tex`,
  `metadados.tex` e `assets/01.png`
- `metadados.tex` contém `\cadernoRascunhotrue` — a forma que **liga** a marca d'água
- o título contém `TEMPLATE DE TESTE`
- `ResolverDeImagens` não é injetado no caminho do teste

**Do `dist`:**
- `figura-exemplo.png` chega ao `dist` (mesmo critério que o card 00 aplicou ao `logo.png`)
- `logo.png` e `LEIA-ME.txt` continuam chegando

---

## Critérios de aceitação

Os do card, mais:

- [ ] `montarZip` recusa template incompleto, nomeando o arquivo ausente
- [ ] O `LEIA-ME.txt` não manda mais abrir pull request, e a redação vale antes do card 13
- [ ] `?rascunho=` com valor estranho é 400, não a publicada em silêncio
- [ ] `tabularx`, `booktabs`, `enumitem` e `ulem` continuam no preâmbulo, com o comentário corrigido
- [ ] Cobertura ≥ 90% no que este card toca
- [ ] `yarn build` gera `dist/main.js` **na raiz**

---

## Gate manual

O que nenhum teste automatizado fecha, e que precisa do dono:

1. **O zip de teste compila no Overleaf** e mostra as 6 questões, com marca d'água
2. **O ciclo fecha**: baixar o zip de teste, editar no Overleaf, baixar de lá, e o upload do card 10
   aceitar — é o critério que ficou pendente no card 10, e é aqui que ele pode ser fechado
3. **O zip da prova continua compilando** depois de passar a ler o template do Mongo

---

## Risco

**Baixo.** É troca de fonte de leitura, e o 503 explícito impede a falha silenciosa.

O ponto de atenção real não é técnico: depois deste card, **quem edita o template edita produção**, sem
PR e sem review. As travas continuam sendo as do card 10 — lint bloqueante, imutabilidade das
publicadas e restaurar de um clique — e o que este card acrescenta é o `template=<versao>` no log, que
é como se descobre *qual* edição quebrou.

## O que o card 12 herda daqui

**Um endpoint a mais do que ele previa:** `GET /v1/caderno/template/teste`, com `?versao=` e
`?rascunho=`.

**Permissão: `alterarPermissao`, a mesma dos outros endpoints de template** — decidido pelo dono em
2026-09-12. Vale inclusive para `?rascunho=1`, que mostra trabalho ainda não publicado: quem pode
publicar um template já pode ver o rascunho, então uma permissão separada só para ele não protegeria
nada e criaria um segundo eixo de autorização para manter.

**Ordem de deploy:** o `seed:template-caderno` precisa ter rodado no ambiente **antes** deste código
subir. Sem versão publicada, a geração de prova passa a devolver 503 — comportamento correto por
desenho, mas indesejado como surpresa. Medido em 2026-09-12: homologação tem a coleção e os quatro
índices, e **nenhuma versão publicada**.

## O que este card NÃO faz

**Não expõe os endpoints pela api** — card 12.
**Não tem tela** — card 13.
**Não implementa "abrir no Overleaf por URL"** (`zip_uri`): fora de escopo por decisão, até alguém
confirmar num teste manual que o Overleaf aceita zip por URL. Se funcionar, vira card próprio e melhora
o fluxo da POC inteira, não só o do teste de template.
