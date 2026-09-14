# Migração 0003 — Categoria por dono

Roda **antes** do deploy do ms, em cada ambiente.

```bash
MONGODB='mongodb://...' bash migrar.sh
```

## O que faz

1. `dono: "system"` nas categorias existentes
2. `deleted: false` onde o campo não existe
3. Aborta se houver duplicata `(dono, nome)` entre as vivas
4. Dropa `nome_1`
5. Cria `dono_nome_unico` — `{dono, nome}`, unique, parcial sobre `deleted: false`
6. Verifica os índices e aborta se estiverem errados
7. Verifica que nenhuma categoria ficou sem `dono`

## Por que a ordem importa

⚠️ **O backfill vem antes do índice.** Criar o composto com documentos sem `dono` põe todos eles
disputando a mesma chave.

⚠️ **O drop do passo 4 é obrigatório.** `autoIndex` cria índice novo e **não remove** o que saiu do
schema. Sem o drop, o unique global de `nome` continua valendo no servidor: o cursinho A recebe 409 ao
criar "Enem Dia 1" e **nada no código explica por quê** — a aplicação está certa, quem barra é um
índice que ninguém está mais olhando.

## Por que a migração vem antes do deploy do ms

⚠️ Não é preferência. Duas comparações usam igualdade estrita com `'system'`, e `undefined` não casa:

- `CategoriaService.delete` → toda categoria legada fica **indeletável, inclusive pelo admin**, com um
  403 "Categoria de outro dono" que não sugere migração faltando.
- `ProvaFactory.getFactory` → categoria legada cai na `CustomProvaFactory`, então **prova de ENEM Dia 1
  nasce com 1 simulado no lugar de 5**, em silêncio.

## Rollback

```bash
mongosh "$MONGODB" --eval '
  db.categorias.dropIndex("dono_nome_unico");
  db.categorias.createIndex({ nome: 1 }, { unique: true, name: "nome_1" });
'
```

⚠️ O rollback **falha** se já existirem duas categorias de donos diferentes com o mesmo nome — que é
justamente o estado que esta migração passa a permitir. A partir do momento em que o primeiro cursinho
criar uma categoria homônima, o caminho de volta exige decidir qual delas renomear.
