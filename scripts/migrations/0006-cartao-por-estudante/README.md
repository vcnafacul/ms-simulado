# Migração 0006 — índice `cartao_por_estudante`

**Por quê:** o QA conseguiu enviar o mesmo cartão duas vezes para o mesmo estudante em homol (2026-09-28). O
código barra (consulta + 409 — commit `e711453`), mas o **índice único não existia**: o `autoIndex` tenta
criá-lo no boot e **falha em silêncio** quando o banco já tem duplicados (envios de antes da correção). Sem
o índice, dois envios quase juntos passam os dois.

```bash
MONGODB='mongodb://...' bash migrar.sh            # 1º: só LISTA os duplicados
MONGODB='mongodb://...' bash migrar.sh --aplicar  # 2º: resolve SEM apagar e cria o índice
MONGODB='mongodb://...' bash migrar.sh --excluir  # ou: resolve APAGANDO e cria o índice
```

- **homol:** `--excluir` (decisão do Fernando, 2026-09-28) — apaga os duplicados e o vínculo deles no
  relatório do cursinho. **Sem volta.**
- **prod:** rodar o modo lista primeiro e decidir; `--aplicar` é o reversível.

Rodar em **homol e em prod** (prod depois do deploy da versão com o `e711453`).

Sem `mongosh` instalado, o script usa o da imagem `mongo:7` pelo Docker, automaticamente.
⚠️ O `MONGODB` tem de ser alcançável de dentro do container: com URI remota (VPS/Atlas), funciona. Com
`localhost`, rode o script **na própria VPS** (ou use `host.docker.internal` no lugar de `localhost`, no Mac).

## O que o `--aplicar` faz
Em cada grupo (mesmo estudante, simulado e cartão):
- **fica** o histórico com leitura concluída (`completed` > `processing` > `awaiting_omr` > `pending` >
  `failed`); empate: o mais recente;
- **os outros perdem o `cartaoCode`** — vai para `cartaoCodeDuplicado`, e `duplicadoDe` aponta o que
  ficou. **Nada é apagado.** Fora do índice parcial, eles deixam de impedir a criação dele.

Depois cria o índice e aborta se ainda sobrar duplicado.

## ⚠️ O que o `--aplicar` NÃO faz
Os históricos rebaixados continuam ligados ao relatório do cursinho (`relatoriosimuladoestudantes`): o
estudante pode seguir aparecendo duas vezes no relatório daquele simulado. Tirá-los de lá é decisão à parte
— o modo lista mostra os ids para conferir.

## Rollback
```js
db.historicos.dropIndex("cartao_por_estudante")
db.historicos.updateMany(
  { cartaoCodeDuplicado: { $exists: true } },
  { $rename: { cartaoCodeDuplicado: "cartaoCode" }, $unset: { duplicadoDe: "" } },
)
```
