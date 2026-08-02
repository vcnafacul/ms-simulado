# Migração 0001 — Questão Multi-Prova (Fase 2)

Popula `Prova.questoesNovo` e `Simulado.questoesNovo` a partir do modelo antigo
(`Questao.prova` + `Questao.numero`). Arrays antigos (`questoes`) permanecem
intactos — os dois coexistem após esta fase. Nenhum consumer lê `questoesNovo`
ainda (Fase 3+). Reversível (`$unset questoesNovo`).

Os scripts NÃO conectam ao Mongo: operam sobre JSON exportado localmente.

## Pré-requisitos

`jq` (>=1.6), `openssl`, `bash`, e o Mongo Database Tools (`mongodump`,
`mongoexport`, `mongoimport`). `$MONGODB` = URI do banco alvo.

## Procedimento (homol primeiro, depois prod)

### 1. Backup obrigatório (restore safety)

```bash
DATE=$(date +%Y%m%d-%H%M%S)
mongodump --uri="$MONGODB" --collection=questoes  --out="./backup-$DATE/"
mongodump --uri="$MONGODB" --collection=provas    --out="./backup-$DATE/"
mongodump --uri="$MONGODB" --collection=simulados --out="./backup-$DATE/"
du -sh "./backup-$DATE/"            # confirmar tamanho não-zero
# subir ./backup-$DATE/ para R2/S3 com retenção >=90 dias; documentar o caminho no PR
```

Backup apenas destas 3 collections (NÃO `historico`).

### 2. Exportar as collections (JSON array, Extended JSON relaxado = default)

```bash
mongoexport --uri="$MONGODB" --collection=questoes  --jsonArray --out=questoes.json
mongoexport --uri="$MONGODB" --collection=provas    --jsonArray --out=provas.json
mongoexport --uri="$MONGODB" --collection=simulados --jsonArray --out=simulados.json
```

> Caso o modelo precise de outras collections no futuro, exportá-las aqui e
> ajustar o `migrate.sh`. Hoje só estas 3.

### 3. Rodar a migração

```bash
bash migrate.sh .            # gera provas.out.json e simulados.out.json
bash validate.sh .           # deve terminar com "✅ Validação OK" (exit 0)
```

Se `validate.sh` sair com código 1, NÃO reimportar — investigar os logs.

### 4. Smoke em homol (antes de reimportar em prod)

Reimporte (passo 5) em homol e confira no frontend — tudo ainda lê do array
antigo, então deve estar idêntico:
- DashProva abre; abrir 1 prova; abrir 1 simulado.
- Responder 1 simulado → histórico funciona.

### 5. Reimportar (drop + import — backup já salvo)

```bash
mongosh "$MONGODB" --eval 'db.provas.drop(); db.simulados.drop();'
mongoimport --uri="$MONGODB" --collection=provas    --jsonArray --file=provas.out.json
mongoimport --uri="$MONGODB" --collection=simulados --jsonArray --file=simulados.out.json
```

`questoes` **não muda** nesta fase — não reimportar.

### 6. Produção

Repetir 1→5 em janela de manutenção (~10min), sem deploys/writes concorrentes.
Guardar logs (`bash migrate.sh . > migrate-prod-$DATE.log 2>&1`). Backup
obrigatório antes. Se algo falhar → `rollback.md`.

## Idempotência

`migrate.sh` sobrescreve `questoesNovo`; rodar 2x = mesmo resultado.
