# Caderno · Overleaf — Card 00: trazer o template para o repo

**Data:** 2026-09-07
**Origem:** `vcnafacul-3/docs/prova-latex-overleaf/cards/00-template-no-repo.md`
**Etapa:** Caderno · Overleaf (`vcnafacul-3/docs/prova-latex-overleaf/README.md`)
**Repos afetados:** `ms-simulado` (só este)
**Branch base:** `poc/caderno-overleaf` (saída da `develop`)

## Contexto

Esta POC gera um caderno de prova imprimível a partir de um simulado, **sem compilar LaTeX**. O serviço
escreve arquivos de texto; quem compila é o Overleaf, num projeto criado pelo próprio usuário a partir
do zip baixado.

**Cada geração vira um projeto novo no Overleaf.** Isso dispensa saber se o Overleaf extrai zip dentro
de projeto existente, e obriga o zip a compilar sozinho — carregando o template junto do conteúdo
gerado.

Este card traz o template. Ele **já existe, já foi compilado e já foi aprovado numa rodada real no
Overleaf** — é o card 01 da POC anterior (`poc/caderno-latex`, PR #174). Nada é reescrito.

⚠️ **Não existe `main-multicol.tex`.** Ele foi o plano B do smoke test e saiu no fechamento daquele
card, depois que a compilação escolheu o `main.tex` — que **já é de duas colunas**
(`\documentclass[11pt,a4paper,twocolumn]{exam}`).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde os arquivos moram | `src/modules/caderno/templates/v1/`, com globs no `nest-cli.json` | O serviço **lê** o template em runtime para pô-lo no zip. O `ms.dockerfile` faz `COPY dist ./` e mais nada: template fora do `dist` não existe em produção. Mesmo padrão do `cartao-resposta`. |
| Eixo de variante | **Não existe.** `templates/v1/`, não `templates/padrao/v1/` | A POC anterior antecipava uma variante `ampliada` que não está neste escopo. Um nível de diretório por algo que não existe é a complexidade que esta POC veio cortar. Se a ampliada chegar, é um `git mv`. |
| `logo.png` | **Cópia**, não referência cruzada | O `\capaCaderno` faz `\includegraphics{logo.png}`, caminho relativo ao `main.tex`, então ela precisa estar na raiz do zip. Apontar para `cartao-resposta/assets/` acoplaria dois módulos por um arquivo de 4 KB. |
| `exemplo/` | Vem, e fica **fora** do pacote | Sem ele o card não se verifica sozinho: não haveria `conteudo.tex` nenhum para subir no Overleaf até o card 04 existir. Custa uma linha de `exclude`. |
| Avisos da geração | Bloco de `% AVISO:` no topo do `conteudo.tex` | Zero arquivo novo, e ficam onde a pessoa já vai olhar. Comentário LaTeX não afeta a compilação. **Elimina o `manifest.json`** que a POC anterior tinha. |
| Fonte da verdade | **O repo, e só ele** | Não há projeto do Overleaf persistente para divergir — cada geração cria um descartável. |

## Arquivos

```
src/modules/caderno/templates/v1/
├── main.tex          cópia byte-a-byte da poc/caderno-latex
├── preambulo.tex     idem
├── logo.png          cópia de src/modules/cartao-resposta/assets/logo.png
├── LEIA-ME.txt       cópia + duas edições (abaixo)
└── exemplo/          smoke test — NÃO vai no dist nem no zip
    ├── conteudo.tex  + comentário no topo
    └── metadados.tex
```

Quatro arquivos viajam no zip do usuário; o `exemplo/` fica.

### As duas edições no `LEIA-ME.txt`

O arquivo está quase todo correto — descreve "New Project → Upload Project", que é exatamente o fluxo
desta POC. Foi escrito para a fase 1 da POC anterior, que era o mesmo fluxo. Dois trechos ficaram para
trás:

1. **"O QUE VOCÊ PODE EDITAR"** diz que mudanças no layout "ficam só nesta cópia". Continua verdade, e
   agora mais do que antes, já que cada projeto é descartável. Falta a segunda metade: **quem quiser a
   mudança permanente traz para o repo num PR.** Sem isso alguém ajusta o layout no Overleaf, imprime
   satisfeito, e descobre na prova seguinte que o ajuste não existe.
2. **"AVISOS DA GERAÇÃO"** manda ver o `manifest.json`. Esse arquivo **não vai existir** nesta POC.
   Passa a apontar para o bloco de `% AVISO:` no topo do `conteudo.tex`.

### O comentário no `exemplo/conteudo.tex`

Ele foi escrito quando existia um conversor de markdown, e o gerador desta POC produz outra coisa. Um
comentário no topo diz o que ele é — smoke test do template — e **o que não é**: modelo da saída do
gerador. Sem isso, alguém o abre e o usa como especificação.

## Empacotamento

```json
{ "include": "modules/caderno/templates/**/*.tex", "exclude": "modules/caderno/templates/**/exemplo/**" },
{ "include": "modules/caderno/templates/**/*.txt", "exclude": "modules/caderno/templates/**/exemplo/**" },
{ "include": "modules/caderno/templates/**/*.png", "exclude": "modules/caderno/templates/**/exemplo/**" }
```

As três entradas levam o mesmo `exclude`, inclusive a de `.png`, que hoje não protege nada — é para
que alguém acrescentar uma imagem ao `exemplo/` amanhã não a mande para o download do coordenador.

⚠️ **Este é o mesmo bug de deploy que dominou o card 01 da POC anterior.** Ele não sumiu: voltou junto
com a necessidade que o cria. Cheguei a desenhar este card com o template na raiz do repo, argumentando
que o serviço nunca o leria — isso caiu quando o fluxo de "projeto novo por geração" tornou o zip
autossuficiente.

## O spec que tranca o contrato

`src/modules/caderno/templates.spec.ts`. Este card não tem código de runtime, então ele é a única
verificação automatizável — e o bug que ele guarda é invisível em build, só aparece dentro do
container.

- Os quatro arquivos resolvem por `path.join(__dirname, 'templates/v1')` — **o mesmo caminho que o
  card 04 vai usar.** É isso que faz o teste valer alguma coisa
- O `exemplo/` existe e não está vazio, senão o `exclude` protege um caminho que não existe
- **Toda extensão presente no nível de topo de `templates/v1/` está coberta por um glob**, derivada do
  disco e não de uma lista fixa. É o que pega alguém acrescentando um `.sty` e ele não chegando no
  `dist`. Nível de topo, e não recursivo, porque é exatamente o conjunto que viaja no zip — o
  `exemplo/` está fora por decisão
- Os globs do `nest-cli.json` mencionam o caminho do caderno e carregam o `exclude`

## Verificação manual, uma vez

Montar um zip achatado com os quatro arquivos mais `exemplo/conteudo.tex` e `exemplo/metadados.tex`,
subir no Overleaf, compilar. Prova que a cópia não corrompeu nada.

É a última vez que essa checagem manual é necessária: do card 04 em diante dá para gerar um caderno de
verdade.

## Critérios de aceitação

- [ ] `diff` confirma `main.tex` e `preambulo.tex` byte-idênticos aos da `poc/caderno-latex`
- [ ] `yarn build` e os quatro arquivos aparecem em `dist/modules/caderno/templates/v1/`
- [ ] `exemplo/` **não** aparece no `dist`
- [ ] `ls dist/main.js` — continua na raiz do `dist`
- [ ] `tsconfig*.json` e `ms.dockerfile` intocados
- [ ] O spec passa, e cada asserção falha quando o que ela guarda é quebrado
- [ ] O zip manual compila no Overleaf

## Riscos

| Risco | Mitigação |
|---|---|
| Template não chega no `dist` e some em produção | Os três critérios de `dist` acima; falha invisível em build |
| Arquivo fora de `src/` desloca o `rootDir` e move o `dist/main.js` | Já derrubou o PM2 neste repo com "Script not found /var/www/main.js". O `ls dist/main.js` é o guarda |
| A cópia corromper encoding ou acento | `diff` byte-a-byte, mais a compilação manual |
| Alguém usar o `exemplo/conteudo.tex` como especificação da saída | Comentário no topo do arquivo |

## Fora do escopo

- Qualquer código que **leia** o template — é o card 04
- O gerador do `conteudo.tex` — card 02
- A variante `ampliada` (uma coluna, corpo grande, acessibilidade ENEM)

## Reflexos nos próximos cards

| Card | O que muda |
|---|---|
| 02 | Emite o bloco de `% AVISO:` no topo do `conteudo.tex`. **Não** existe `manifest.json` |
| 04 | O zip leva `main.tex`, `preambulo.tex`, `logo.png`, `LEIA-ME.txt` (deste card) + `conteudo.tex`, `metadados.tex`, `assets/` (gerados), **tudo na raiz plana** exceto `assets/` |
| 04 | Resolve o template por `path.join(__dirname, 'templates/v1')` a partir de `src/modules/caderno/`. **Sem env de versão**: existe uma versão só, e um parâmetro para escolher entre uma opção é a complexidade que esta POC veio cortar. Quando houver duas, aí sim |
