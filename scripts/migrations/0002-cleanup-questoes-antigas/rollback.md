# Rollback — Migração 0002 (Etapa 9, final)

Esta migração é **IRREVERSÍVEL por script**. O `$rename`/`$unset` removeu os
dados antigos (`questoes` como array de refs, `Questao.prova`/`Questao.numero`).
Não há como reconstruí-los a partir do estado pós-migração.

**A única via de rollback é restaurar o backup do passo 1 do `README.md`.**

## Restaurar do backup

```bash
mongorestore --uri="$MONGODB" --drop ./backup-0002
```

Isso restaura as 3 collections (`provas`, `simulados`, `questoes`) ao estado
anterior ao `cleanup.sh` (`--drop` recria cada collection a partir do dump).

Reverter o PR do Card 07a (código) junto, já que o código novo espera o shape
pós-migração.

## Por que o backup é obrigatório

Como o cleanup remove campos de forma destrutiva, sem o backup do passo 1 não é
possível voltar atrás. Por isso o backup (retenção >=90 dias) é pré-requisito e
deve ter o caminho anotado no PR antes de rodar `cleanup.sh`.
