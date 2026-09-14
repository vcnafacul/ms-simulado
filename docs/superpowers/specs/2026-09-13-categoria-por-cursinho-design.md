# Categoria por cursinho — `dono` e unicidade escopada

**Data:** 2026-09-13 · **Repos:** `ms-simulado` · `api-vcnafacul` · `client-vcnafacul`
**Deploy:** lockstep **ms → api → client**, com script de migração antes do ms

---

## O problema

Hoje um cursinho não consegue criar prova cujo exame seja o ENEM sem usar a categoria global
`Enem Dia 1` / `Enem Dia 2` — que é da plataforma, cai na `Enem2017PlusFactory` e monta **5 simulados**
(dia 1) com a estrutura oficial: 95 questões, desdobramento Inglês/Espanhol, Ciências Humanas à parte.

Não é isso que um cursinho quer quando monta o simulado dele. Ele quer **um** simulado, do tamanho que
escolher, e o exame ENEM só como referência.

⚠️ **Vocabulário.** Não existe "categoria ENEM". Existe o **exame** ENEM (`Exame`), referenciado por
`Categoria.exame`. Uma categoria de cursinho referencia o mesmo exame; o que muda é o dono dela.

### Por que ele não consegue hoje

1. **`Categoria` não tem dono.** Nenhum campo, nenhum índice. Categoria é global, ponto.
2. **`nome` é único globalmente** — `@Prop({ unique: true })` mais uma checagem explícita no service.
   Ninguém mais no sistema pode ter uma categoria chamada `Enem Dia 1`.
3. **O cursinho não cria categoria nenhuma:** o CRUD inteiro exige `Permissions.alterarPermissao`.
4. **O nome é validado por pattern** — `/^(?:\S+\s+)*?(?:\d+q|livre)\s+\d+min$/`. `Enem Dia 1` bate
   **400** nele.

---

## A decisão

Categoria ganha um **dono**: `'system'` para as da plataforma, o `cursinhoId` para as do cursinho.
A unicidade do nome passa a ser por dono. O cursinho vê e usa só as dele.

| decisão                                           | escolha                               |
| ------------------------------------------------- | ------------------------------------- |
| Provas de categoria de cursinho                   | **1 simulado**, sempre                |
| Globais `Enem Dia 1`/`Dia 2` no modal do cursinho | **não aparecem**                      |
| Escopo da unicidade                               | `{ dono, nome }`                      |
| Pattern de nome                                   | **cai só para categoria de cursinho** |

### A fábrica NÃO muda

O `CategoriaService.add` já força `custom: true` em tudo que passa por ele, e o `getFactory` já roteia
`custom` → `CustomProvaFactory` → 1 simulado. **"Toda categoria de cursinho gera 1 simulado" já é o
comportamento**, desde que as categorias do cursinho passem pelo mesmo `add` — e passam.

⚠️ **Mas hoje isso é invariante implícita.** Ela depende de o `add` continuar forçando `custom: true`;
um endpoint de update futuro, ou um seed, poderia produzir uma categoria de cursinho com
`custom: false` — e ela cairia na fábrica do ENEM, criando 5 simulados para um cursinho. O roteamento
passa a ser explícito:

```ts
if (categoria.custom || categoria.dono !== DONO_SYSTEM) {
  return new CustomProvaFactory(...);
}
```

Uma linha, e a invariante deixa de depender de um detalhe de outro arquivo.

---

## ms-simulado

### 1. O campo

```ts
/**
 * Quem é dono da categoria: `'system'` (plataforma) ou o `cursinhoId`.
 *
 * ⚠️ Sentinela, e NUNCA nulo. Num índice composto único, documento com o campo
 * ausente e documento com o campo nulo não são a mesma coisa em toda versão do
 * Mongo — e a diferença só aparece quando a segunda categoria de mesmo nome é
 * criada, em produção.
 */
@Prop({ required: true, default: DONO_SYSTEM })
public dono: string;
```

`DONO_SYSTEM = 'system'` exportado como constante — o literal não se repete em quatro arquivos.

### 2. O índice

```ts
CategoriaSchema.index(
  { dono: 1, nome: 1 },
  { unique: true, name: 'dono_nome_unico' },
);
```

⚠️ **O `nome_1` antigo precisa ser dropado explicitamente.** `autoIndex` cria índice novo e **não
remove** o que saiu do schema. Sem o drop, o unique global continua valendo no servidor e o cursinho A
segue impedido de criar `Enem Dia 1` — **sem erro em lugar nenhum**, porque o código novo está certo e
quem barra é um índice que ninguém está mais olhando.

⚠️ Índice recebe `name` explícito. Dois `index()` sobre chaves parecidas pedem nomes derivados iguais e
o servidor recusa o segundo com `IndexKeySpecsConflict` — com `autoIndex`, a aplicação sobe em
silêncio sem o índice. Já aconteceu neste repo (card 10 do caderno).

### 3. O service

- `add(dto, dono)` — o `dono` é **parâmetro**, injetado pela api. Nunca lido do corpo da requisição.
- A checagem de colisão passa a ser `getByFilter({ nome, dono })`.
- O pattern só é aplicado quando `dono === DONO_SYSTEM`.
- `getAll` aceita filtro por `dono`.

⚠️ **A geração automática de nome** (`gerarNomeAuto`) produz nomes no pattern. Ela continua valendo
para os dois, porque é fallback de quem não informou nome — o que cai é a _obrigação_ de o nome
informado seguir o pattern, não a geração.

### 4. Rota de leitura escopada

`GET /v1/categoria?dono=<id>` — a api decide o valor. O ms não conhece JWT nem cursinho.

---

## api-vcnafacul

### 5. Controller do cursinho

`mssimulado/cursinho/categoria`, no mesmo molde do `cursinho-prova.controller.ts`: resolve o
`cursinhoId` pelo JWT via `CursinhoResolverService` e o injeta como `dono`.

⚠️ **O `dono` nunca vem do corpo.** É exatamente o que o `cursinho-prova.controller` já faz com
`criadorId` e `cursinhoId`, e pelo mesmo motivo: o cliente não decide de quem é o registro.

- `GET` → lista só as do cursinho
- `POST` → cria com `dono = cursinhoId`
- `DELETE` → ver abaixo

Permissão nova, **não** `alterarPermissao` — que é administração de papéis e não tem relação com isto.
Segue o padrão do projeto de coluna booleana em `roles`.

### 6. ⚠️ O DELETE precisa checar o dono

Hoje `DELETE /mssimulado/categoria/:id` apaga por id e mais nada. Com categorias de cursinho, **o
cursinho A apaga a do cursinho B** passando o id — e apaga a global também.

A rota do cursinho só pode apagar categoria cujo `dono` seja o cursinho dele. O ms precisa expor isso
como condição do delete, não como consulta seguida de delete (janela de corrida), ou a api precisa
passar o `dono` esperado.

### 7. A rota de admin

Injeta `dono: DONO_SYSTEM`. O comportamento visível não muda: admin continua colidindo com
`Enem Dia 1`, que é o erro correto.

---

## client-vcnafacul

### 8. Serviço e tela

- `getCategoriasCursinho` → `mssimulado/cursinho/categoria`.
- `partnerPrepProvas` usa ela, tanto para o `NewProva` quanto para o `ManageCategorias`.
- "Gerenciar Categorias" na tela do cursinho **deixa de ser o botão inerte** e passa a exigir a
  permissão nova.

⚠️ O `NewProva` é compartilhado entre as duas telas. Ele já filtra por `selecionavel`; o recorte por
dono vem da lista que a tela passa, não de um `if` dentro do modal — senão o modal precisaria saber em
que tela está, que é a dependência que se evita.

---

## Migração

Script `mongosh`, rodado **antes** do deploy do ms, em cada ambiente:

1. `updateMany({ dono: { $exists: false } }, { $set: { dono: 'system' } })`
2. `dropIndex('nome_1')`
3. `createIndex({ dono: 1, nome: 1 }, { unique: true, name: 'dono_nome_unico' })`

⚠️ **Ordem importa.** Criar o composto antes do backfill deixa todos os documentos com `dono` ausente
disputando a mesma chave.

⚠️ **O passo 2 falha se o índice já não existir** (ambiente novo). O script tem que tolerar isso sem
abortar os passos seguintes — e tem que ser idempotente, porque vai rodar em três ambientes.

---

## Testes

- `dono` default `'system'` quando não informado.
- Duas categorias de mesmo nome e donos diferentes: **permitido**.
- Duas de mesmo nome e mesmo dono: **409**.
- Cursinho criando `Enem Dia 1`: permitido. Admin criando `Enem Dia 1`: **409** (a seedada).
- Pattern aplicado com `dono: 'system'`, ignorado com dono de cursinho.
- `add` ignora `dono` vindo no corpo.
- `getFactory` com `dono` de cursinho e `custom: false` → `CustomProvaFactory` (a invariante explícita).
- DELETE do cursinho A sobre categoria do cursinho B: **negado**.
- `partnerPrepProvas` não lista categoria de outro dono.

⚠️ O teste que mais importa é o do índice: **subir a aplicação e conferir que `nome_1` não existe
mais**. Um teste de unidade sobre o schema não vê o estado do servidor, que é justamente onde o
defeito mora.

---

## Fora de escopo

- Transferir categoria entre donos.
- Editar categoria (não existe update hoje).
- Cursinho enxergar categorias globais genéricas — decidido que **não** enxerga.
