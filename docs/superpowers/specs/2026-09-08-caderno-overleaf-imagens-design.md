# Card 03 · Imagens: resolução, defesa e cache

**POC:** Caderno · Overleaf · **Branch:** `feature/caderno-03-imagens` (de `poc/caderno-overleaf`)
**Card:** `docs/prova-latex-overleaf/cards/03-imagens-cache-redis.md` · **Depende de:** card 02 (mergeado, PR #178)

---

## O que é

O card 02 devolve `ImagemRef[]` — de onde cada imagem vem e sob que nome ela aparece no `.tex`. Este
card busca os bytes e devolve os arquivos que vão no zip.

```ts
@Injectable()
export class ResolverDeImagens {
  constructor(
    private readonly storage: StorageService,
    private readonly env: EnvService,
  ) {}

  async resolver(refs: ImagemRef[]): Promise<ResultadoDaResolucao>;
}
```

⚠️ Serviço Nest, não função livre: precisa do `StorageService` e do `EnvService`. As peças **abaixo**
dele (`formato`, `endereco-seguro`, `buscador-http`) são funções puras sem injeção — é o que permite
testá-las sem levantar módulo nenhum.

Diferente do card 02, **este faz I/O**: lê do R2, busca na internet, grava cache. É a fronteira onde
o gerador puro encosta no mundo.

## O card foi reescrito

O card original assumia que imagem é `asset://` no `BUCKET_QUESTION`. O card 02 mostrou que **URL
externa é ~100% do acervo**. Três consequências, todas incorporadas abaixo:

1. Existe um caminho de busca HTTP, que o card não previa.
2. A justificativa do cache mudou: o card falava em "gerar o mesmo simulado dezenas de vezes durante a
   iteração de layout", que era o fluxo da POC 1. Na POC 2 baixa-se **uma vez** e itera-se no Overleaf.
   O que sobrou, e é razão melhor, é não martelar o servidor de um terceiro ~100 vezes por download,
   com vários coordenadores baixando o mesmo simulado.
3. O critério "extensão pelos magic bytes" era **incompatível** com o card 02 como mergeado. Ver
   "O que muda no card 02".

## Premissa confirmada, e uma corrigida

✅ **A key do bucket é imutável** — cada upload gera um uuid novo (`s3-service.ts:45`). TTL longo é
seguro e não existe invalidação.

❌ **"Homologação não tem Redis"** era conclusão minha lendo `QUEUE_DRIVER=memory` no `.env.example`.
Homol tem um `redis:7-alpine` rodando. O que resta conferir é se o `.env` do ms-simulado aponta para
ele — uma linha, não infraestrutura.

---

## Arquitetura

```
src/shared/storage/storage.service.ts      get/putObject com bucket opcional
src/modules/caderno/imagens/
├── tipos.ts                 ArquivoDoZip, ResultadoDaResolucao
├── formato.ts               magic bytes → extensão
├── endereco-seguro.ts       DNS + faixas privadas
├── buscador-http.ts         fetch com timeout, teto e redirect manual
├── cache-r2.ts              caderno-cache/<sha256 da url>
├── resolver.ts              orquestra as duas origens
└── imagem-indisponivel.png  o placeholder
```

### Contrato

```ts
export interface ArquivoDoZip {
  /** caminho dentro do zip, COM extensão: 'assets/01.jpeg' */
  nome: string;
  buffer: Buffer;
}

export interface ResultadoDaResolucao {
  arquivos: ArquivoDoZip[];
  avisos: string[];
  metricas: {
    doCache: number;
    doBucket: number;
    daInternet: number;
    falhas: number;
    bytes: number;
    ms: number;
  };
}
```

⚠️ `ImagemRef.arquivo` do card 02 é a referência **sem** extensão (`assets/01`); `ArquivoDoZip.nome` é
o arquivo real **com** extensão (`assets/01.jpeg`). Nomes diferentes de propósito: são coisas
diferentes, e confundi-las é como a extensão erra.

---

## Os dois caminhos

**`origem: 'r2'`** — lê a key direto do `QUESTAO_BUCKET`. Não passa por cache: já é nosso, e cachear
R2 em R2 não paga nada.

**`origem: 'url'`** — procura `caderno-cache/<sha256(url)>`; se não achar, busca no host externo,
devolve os bytes e grava a cópia.

⚠️ **A chave do cache é o sha256 da URL**, não um uuid. Isso dá idempotência de graça — baixar duas
vezes não cria duas cópias — e deduplica o acervo inteiro sem tabela nenhuma.

⚠️ **O cache não vai no `QUESTAO_BUCKET`.** Aquela credencial fica só de leitura, como o card pedia.
Vai no bucket que o ms-simulado já escreve, hoje chamado `CARTAO_BUCKET` — nome que fica um pouco
mentiroso, e renomear env var custa coordenação de deploy que uma POC não precisa pagar. Registrado no
código, não escondido.

### O papel da cópia: cache, não republicação

A questão **continua apontando para o host externo**. O R2 só evita rebaixar. Apagar o prefixo
`caderno-cache/` inteiro não quebra nada — só esfria o cache.

Isso é decisão, não descuido: promover a cópia a asset definitivo e reescrever a referência da questão
é o **card 08**, que tem `--dry-run`, ensaio em homol e a pergunta de direito autoral em aberto. Fazer
isso como efeito colateral de um download seria decidir por acidente.

---

## A defesa da busca externa

Este é o ponto onde o serviço faz requisição de saída para uma URL que veio do texto de uma questão.

Antes de cada requisição:

1. Extrai o host, resolve o DNS com `dns.promises.lookup(host, { all: true })`
2. Recusa se **qualquer** endereço resolvido cair em faixa privada, loopback, link-local ou CGNAT —
   IPv4 e IPv6. `169.254.169.254` (metadata da VPS) é o alvo clássico.
3. Redirecionamento é **manual** (`redirect: 'manual'`): cada salto refaz 1 e 2, com teto de **3
   saltos**. Seguir redirecionamento automaticamente anula a checagem — é o furo mais comum desta
   defesa, porque o `fetch` segue por padrão e a checagem inicial passa.
4. Timeout de 5 s por imagem, via `AbortSignal.timeout`.
5. Teto de 10 MB por imagem, contado **enquanto lê o corpo**. `Content-Length` é informado pelo
   servidor remoto e pode mentir ou faltar.

A lista fechada de esquemas (`http:`, `https:`, `asset:`) já vem filtrada do card 02.

### O que esta defesa NÃO cobre

⚠️ **DNS rebinding.** Entre resolver o nome e abrir a conexão, o registro pode mudar para um IP
privado. Fechar exigiria fixar o IP resolvido na conexão, o que precisa de um `Agent` do `undici` — e
`undici` **não é dependência direta** deste projeto.

Não vamos adicionar o pacote por isso, e o motivo é o modelo de ameaça, não preguiça: o texto da
questão é escrito por administrador nosso, não pelo público. O ataque exige conta de admin
comprometida **e** servidor DNS controlado — e quem tem a primeira tem caminhos mais diretos.

Fica **registrado no docblock do módulo**, não numa nota de rodapé de documento. Se um dia o cadastro
de questão abrir para fora, este é o parágrafo que manda reabrir a decisão.

---

## Formato: os bytes mandam, não o nome

Extensão sai dos **magic bytes**:

| Formato | Assinatura | pdflatex |
|---|---|---|
| PNG | `89 50 4E 47` | ✅ |
| JPEG | `FF D8 FF` | ✅ |
| PDF | `%PDF` | ✅ |
| GIF | `47 49 46 38` | ❌ |
| WEBP | `RIFF` … `WEBP` | ❌ |

⚠️ **O pdflatex não inclui GIF nem WEBP.** Uma imagem nesses formatos falharia mesmo com a extensão
correta, então é recusada como qualquer outra falha — melhor um marcador visível do que um erro de
compilação.

Bytes que não casam com nenhuma assinatura conhecida também são recusados.

---

## Toda falha vira um arquivo, nunca um buraco

O card 02 já escreveu `\includegraphics{assets/01}` no `.tex`. Se este card não produzir arquivo
nenhum para aquele nome, o LaTeX para com "File not found" — o pior desfecho desta POC, o zip que não
compila.

Então **toda** falha grava os bytes do `imagem-indisponivel.png` como `assets/NN.png` — o `NN` que o
card 02 escolheu, mais `.png`, que é o formato do placeholder — e acrescenta um aviso:

| Falha | Aviso |
|---|---|
| key inexistente no bucket | `imagem não encontrada no acervo` |
| host resolve para IP privado | `endereço de imagem recusado` |
| formato não suportado (GIF/WEBP/desconhecido) | `formato de imagem não suportado` |
| passou de 10 MB | `imagem grande demais` |
| timeout ou erro de rede | `imagem não pôde ser baixada` |
| teto agregado estourado | `caderno passou do limite de imagens` |

Cada aviso diz o nome do arquivo no zip, para casar com o `% AVISO:` do card 02.

⚠️ O placeholder é um `.png` de verdade no repo, e precisa de glob no `nest-cli.json` — mesma
armadilha do card 00: `ms.dockerfile` faz `COPY dist ./` e nada mais, então arquivo fora do `dist` não
existe em produção.

⚠️ E o teste de globs do card 00 **não** vai pegar isso. Ele filtra por
`startsWith('modules/caderno/templates')`, então um glob em `modules/caderno/imagens/` não entra na
lista comparada e o teste segue verde com o placeholder sumindo do `dist`.

O placeholder precisa de **teste próprio**, no mesmo espírito: o arquivo existe no repo, e existe um
glob que o cobre. Um asset sem teste é exatamente como o problema do card 00 volta.

## Tetos

- 10 MB por imagem
- 40 MB agregado — ao estourar, as restantes viram placeholder com aviso, em vez de o zip ficar
  gigante
- Concorrência 5

---

## `StorageService` parametrizado

```ts
async get(key: string, bucket?: string): Promise<Buffer>
async putObject(key, body, contentType, bucket?): Promise<void>
async exists(key: string, bucket?: string): Promise<boolean>
```

`bucket` omitido → `CARTAO_BUCKET`. **Zero regressão no cartão-resposta**, e os testes dele são a rede
de segurança: passam sem alteração.

## Env

```
QUESTAO_BUCKET=simulado-questoes
```

No schema Zod, **sem default** — um default silencioso apontaria para o bucket errado e a falha
apareceria como "imagem não encontrada", que é o sintoma mais confuso possível. Ausente, o resolver
falha com mensagem explícita.

Credencial de **leitura apenas** nesse bucket.

## Redis: fora deste card

O card original pedia Redis na frente. Fica para depois, pelo mesmo motivo do card 07: um GET no R2 já
é rápido, e o ganho de uma camada quente por cima é de dezenas de milissegundos por imagem — chute até
medir. As métricas deste card (`doCache`, `doBucket`, `daInternet`, `ms`) são exatamente a medição que
decide.

---

## O que muda no card 02, já mergeado

O card 02 crava a extensão no `.tex`, tirada do path da URL, e **recusa** referência sem extensão.
Isso torna impossível "extensão pelos magic bytes". Como os bytes é que sabem a verdade, o card 02
cede:

- `emitirImagem` deixa de emitir extensão: `\includegraphics[…]{assets/01}`
- `ColetorDeImagens` deixa de exigir extensão válida, e passa a aceitar referência sem extensão
- a constante `EXTENSAO_VALIDA` e a recusa por extensão **desaparecem**
- `ImagemRef.arquivo` passa a ser `assets/NN`, sem extensão
- o snapshot do card 02 é regerado

⚠️ **Isso remove uma regra de segurança inteira, e o motivo é que ela deixa de ter alvo.** A regra
existia porque a extensão era o único byte da referência que chegava ao `.tex`. Sem extensão, o
caminho emitido é 100% gerado por nós — a injeção pelo nome de arquivo deixa de ser possível, em vez
de ser barrada.

⚠️ **A lista fechada de esquemas FICA.** Ela nunca foi sobre injeção em LaTeX: é ela que decide o que
este card vai buscar na rede.

---

## Testes

**Puros, sem rede e sem R2** (mock do storage e do fetch):

- `origem: 'r2'` lê do `QUESTAO_BUCKET`, não do `CARTAO_BUCKET`
- `origem: 'url'` com cache quente: lê do cache, **não** chama o fetch
- `origem: 'url'` com cache frio: chama o fetch **uma vez** e grava no cache
- a mesma URL em duas refs busca uma vez só
- chave do cache é o sha256 da URL, estável entre execuções
- key inexistente → placeholder + aviso, sem exceção
- métricas batem: `doCache`, `doBucket`, `daInternet`, `falhas`

**Defesa** (`endereco-seguro`, puro, com `dns.lookup` mockado):

- `169.254.169.254` recusado
- `10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `0.0.0.0` recusados
- `::1`, `fc00::/7`, `fe80::/10` recusados
- `100.64.0.0/10` (CGNAT) recusado
- host público aceito
- host que resolve para **dois** IPs, um público e um privado → recusado
- redirecionamento para IP privado recusado no salto
- teto de saltos respeitado

**Formato** (`formato`, puro):

- PNG, JPEG e PDF reconhecidos pelos bytes
- GIF e WEBP reconhecidos e **recusados**, com o motivo certo
- bytes que não casam nada → recusado
- buffer de 2 bytes não estoura

**Busca** (`buscador-http`, com fetch mockado):

- corpo maior que o teto é cortado durante a leitura, mesmo com `Content-Length` mentindo
- timeout vira falha, não exceção
- 404 vira falha, não exceção

**Regressão do cartão-resposta:**

- `storage.get(key)` sem bucket continua no `CARTAO_BUCKET`
- toda a suíte de `cartao-resposta` passa **sem alteração**

**Card 02 depois da mudança:**

- `\includegraphics{assets/01}` sem extensão
- referência sem extensão é aceita
- o `.tex` não contém `.png` nem `.jpeg` em nenhum `\includegraphics`

## Critérios de aceitação

- [ ] Todos os testes acima
- [ ] Cobertura ≥ 90% em `imagens/`
- [ ] `QUESTAO_BUCKET` ausente → boot normal, e a resolução falha com mensagem explícita
- [ ] `.env.example` atualizado
- [ ] Glob do placeholder no `nest-cli.json`, e o teste de globs do card 00 atualizado
- [ ] `yarn build` gera `dist/main.js` na raiz, e o placeholder existe em `dist/`
- [ ] Nenhuma chamada de rede real na suíte

## Gate

Manual, no Overleaf, e desta vez com **imagem de verdade** — o do card 02 usou cópias do `logo.png`.
Um simulado real de homologação, com URLs do `enem.dev`, baixado duas vezes: a segunda tem que mostrar
`doCache` alto e `daInternet` zero.

O que olhar no PDF: a figura certa em cada questão, dentro da coluna, e o `assets/01` sem extensão
resolvendo. **É o gate que confirma a busca de extensão do `graphicx`** — a única parte deste desenho
que nenhum teste unitário alcança.

## Risco

**Médio.** Mudança aditiva no `StorageService`, com o cartão-resposta como rede de segurança, e o
resolver é testável com mock. Os riscos reais são três, e nenhum é de lógica:

1. **Infra** — credencial nova em cada ambiente.
2. **A busca de extensão do `graphicx`**, que só o gate confirma. Se falhar, o plano B é o card 02
   voltar a emitir extensão e este card renomear pelos magic bytes com aviso na divergência.
3. **Rede alheia** — o `enem.dev` fora do ar transforma todas as figuras em placeholder. O caderno sai
   e compila, com avisos; é degradação, não queda.
