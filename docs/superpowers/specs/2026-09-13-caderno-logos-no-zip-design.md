# Caderno — os dois logos no zip (ms-simulado)

**Data:** 2026-09-13
**Serviços:** `ms-simulado` (este doc) + `api-vcnafacul` (ver `2026-09-13-caderno-logos-resolucao-design.md` lá)

---

## Problema

O template publicado do caderno passou a referenciar duas imagens que o zip não
contém: `logo_vnf.png` e `logo_cursinho.png`. Quem baixa o caderno e sobe no
Overleaf recebe um documento sem as marcas — ou um erro de compilação, se o
template não guardar o `\includegraphics`.

O `logo.png` que sai hoje de `ARQUIVOS_DO_REPO` é outro arquivo, de um template
anterior, e continua saindo.

## Por que os logos não podem nascer aqui

| Arquivo | Origem | Quem sabe | Por quê |
|---|---|---|---|
| `logo_vnf.png` | `BUCKET_HOME`, chave `logo.png` | api | bucket do domínio do api |
| `logo_cursinho.png` | `BUCKET_PARTNERSHIP_DOC`, chave em `partner_prep_course.logo` | api | a chave está no **MySQL**, e o cursinho depende de **quem pediu** (JWT) |

O ms-simulado não tem contexto de usuário — o `GET v1/caderno/:id` de hoje não
carrega nada além do id do simulado — e não lê o MySQL. Os bytes precisam vir
de fora.

## Decisão: o api manda os bytes

Descartadas duas alternativas:

- **api injeta no zip depois de receber.** Faria a montagem do zip ter dois
  donos. O `zip.ts` tem docblock explícito sobre raiz plana e sobre quem põe o
  quê; um segundo lugar mexendo no zip é o acoplamento invisível que este
  código vem evitando de propósito.
- **api manda as chaves, ms-simulado lê dos buckets.** Tem precedente (o
  resolver já lê `QUESTAO_BUCKET`), mas custa duas env vars novas que precisam
  estar no deploy antes da feature funcionar, perde o cache de 1 dia que o
  `PartnerPrepCourseService.getLogo` já tem, e transforma uma chave vinda pela
  rede em leitura de bucket.

## Contrato

```jsonc
POST v1/caderno/:simuladoId([0-9a-fA-F]{24})?draft=true
{ "logos": { "vnf": "<base64>", "cursinho": "<base64>" } }
```

Chave ausente ou `null` = aquele logo não existe para este download. Este lado
aceita as duas formas; o api sempre **omite** a chave. Tolerar `null` é para
quem escrever um cliente depois não descobrir a diferença em produção.

⚠️ **As chaves são semânticas, não nomes de arquivo.** Quem decide que
`cursinho` vira `logo_cursinho.png` na raiz do zip é este serviço, junto com o
resto do layout. Deixar o api mandar `{"logo_cursinho.png": "..."}` faria o
chamador ditar nome de arquivo dentro do zip — exatamente o que a decisão acima
recusou.

O mapa mora em `templates.ts`, ao lado de `ARQUIVOS_DO_REPO`:

```ts
export const NOMES_DOS_LOGOS = {
  vnf: 'logo_vnf.png',
  cursinho: 'logo_cursinho.png',
} as const;
```

### O GET continua existindo

`GET v1/caderno/:id` fica, gerando o zip **sem** logos.

Motivo é deploy, não elegância: api e ms-simulado sobem separados. Se o api
subisse antes, todo download de caderno morreria em 404 até o segundo deploy
terminar. Com o GET vivo, qualquer ordem funciona e o pior caso é um caderno
sem logos por alguns minutos.

Remover é card próprio, depois de os dois estarem em produção.

## Montagem

`gerarZip(simuladoId, { draft, logos })` repassa para `montarZip`, que escreve
cada logo presente na raiz plana, ao lado de `main.tex` — mesma regra dos
`ARQUIVOS_DO_REPO`, pelo mesmo motivo (o `\includegraphics` do `main.tex`
resolve relativo a ele).

Logo ausente gera um `% AVISO:` — comentário LaTeX no topo do `conteudo.tex`,
invisível no PDF e visível para quem abre no Overleaf — e entra na contagem do
header `X-Caderno-Avisos`. Sem isso, um cabeçalho sem a marca do cursinho não
tem explicação em lugar nenhum.

Um aviso por logo ausente, texto fixo:

| Ausente | Aviso |
|---|---|
| `cursinho` | `logo do cursinho não disponível — o cabeçalho sai sem a marca` |
| `vnf` | `logo do Você na Facul não disponível — o cabeçalho sai sem a marca` |

Passam pelo `umaLinhaSo` como qualquer outro aviso: quebra de linha dentro de um
`% AVISO:` encerra o comentário e joga o resto dentro do documento.

## Lint do template

Regra nova em `template-lint.ts`, nível **erro** (reprova a publicação):

> `\includegraphics{X}`, onde `X` é `logo_vnf.png` ou `logo_cursinho.png`, que
> não esteja dentro de um `\IfFileExists{X}` **do mesmo nome de arquivo**.

Mesmo nome, e não "algum `\IfFileExists` por perto": um
`\IfFileExists{logo_vnf.png}{...\includegraphics{logo_cursinho.png}...}`
compila quando falta só o do cursinho e quebra do mesmo jeito. O critério é por
arquivo porque a ausência é por arquivo.

É o que sustenta a decisão de gerar sem o logo. Sem a regra, a primeira pessoa
sem cursinho a baixar o caderno recebe um erro de LaTeX que não aponta para a
causa — e recebe no Overleaf, longe de quem publicou o template.

O `preambulo.tex` do repo já faz isso para o `logo.png` (`linha 86`), então o
padrão a exigir já existe e já é o praticado.

⚠️ O lint hoje só verifica que caminhos referenciados não **saem** do projeto;
não exige que existam. Esta regra é sobre **guardar**, não sobre existir — um
template que referencia `logo_cursinho.png` guardado continua válido mesmo
quando o arquivo não vem.

## Testes

- `zip.spec.ts` — os dois logos entram na raiz com os nomes de `NOMES_DOS_LOGOS`;
  ausência de um não impede o outro; ausência dos dois não quebra o zip
- `caderno.service.spec.ts` — logo ausente produz aviso e incrementa o total
- `caderno.controller.spec.ts` — POST com logos e GET sem logos produzem o mesmo
  zip exceto pelos dois arquivos
- `template-lint.spec.ts` — template com `\includegraphics{logo_cursinho.png}`
  cru reprova; guardado por `\IfFileExists` passa

## Fora de escopo

- **O `logo.png` de `ARQUIVOS_DO_REPO` fica.** Versões antigas do template
  continuam publicáveis e restauráveis pelo card 10 e podem referenciá-lo. São
  4KB.
- Remover a rota GET.
- Validar tipo de arquivo no upload de logo do cursinho — tratado no api, ver o
  spec de lá.
