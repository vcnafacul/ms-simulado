# Rollback — Migração 0001 (Fase 2)

O sistema continua lendo do array antigo (`questoes`), que permanece intacto.
Rollback é trivial nesta fase.

## Se algo deu errado durante/logo após a migração

```bash
mongosh "$MONGODB" --eval '
  db.provas.updateMany({}, { $unset: { questoesNovo: "" } });
  db.simulados.updateMany({}, { $unset: { questoesNovo: "" } });
'
```

Reverter o PR do Card 01 (schemas) só se necessário.

## Se a migração corrompeu dado antigo (não deveria — só adiciona campo)

Restaurar do backup:

```bash
mongorestore --uri="$MONGODB" --drop --collection=provas    ./backup-<DATE>/<db>/provas.bson
mongorestore --uri="$MONGODB" --drop --collection=simulados ./backup-<DATE>/<db>/simulados.bson
mongorestore --uri="$MONGODB" --drop --collection=questoes  ./backup-<DATE>/<db>/questoes.bson
```

Backup fica arquivado por precaução (retenção >=90 dias).
