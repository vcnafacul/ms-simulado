# Rollback — Migração 0002 (Etapa 9, final)

A transformação da 0002 é **file-based**: `cleanup.sh` gera `*.out.json` a partir
do dump exportado, sem tocar no banco. O estado antigo do banco só muda no passo
de **reimportar** (`db.*.drop()` + `mongoimport`) e ao rodar `indices.sh`.

Enquanto você **não reimportou**, não há o que reverter — é só descartar os
`*.out.json` e não reimportar. Depois do drop+import (ou do `indices.sh`), a via
de rollback é restaurar o backup.

## Restaurar do backup

```bash
mongorestore --uri="$MONGODB" --drop ./backup-0002
```

Isso restaura as 3 collections (`provas`, `simulados`, `questoes`) ao estado
anterior — inclusive `questoesNovo`, o `questoes` antigo de refs, e o campo
original `Questao.prova` (que a migração renomeia para `provaBase`) junto com
`Questao.numero`. O `--drop` recria cada collection a partir do dump, revertendo
também os índices.

Reverter o PR do Card 07a (código) junto, já que o código novo espera o shape
pós-migração.

## Por que o backup é obrigatório

O dump exportado (`provas.json` etc.) preserva os dados antigos, mas o passo de
reimportar faz `drop` das collections. Se algo falhar depois do import (ou do
`indices.sh`), o backup do passo 1 do `README.md` é a forma garantida de voltar
atrás. Por isso o backup (retenção >=90 dias) é pré-requisito e deve ter o
caminho anotado no PR antes de rodar o cleanup.
