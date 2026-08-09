# Migração 0002 — Cleanup Questões Antigas (Etapa 9, final)

Cleanup final da Etapa 9. Dropa o array antigo de refs (`questoes`), renomeia o
subdoc `questoesNovo` → `questoes` em `Prova`/`Simulado`, e em `Questao` renomeia
`prova` → `provaBase` **mantendo** `numero` (âncora da prova de origem, pra quem
veio de uma prova única). Questão sem prova fica sem `provaBase`/`numero` — o
vínculo passa a viver só em `Prova.questoes[]`.

Como a **0001**, os scripts de transformação **NÃO conectam ao Mongo**: operam
sobre JSON exportado localmente e geram `*.out.json` para reimportar.

A **derrubada/criação de índices** é a única parte que precisa do banco (não sai
no `mongoexport` nem entra no `mongoimport`) e por isso fica num script final
separado, `indices.sh`, rodado por último.

Os scripts:

| Script | Conecta ao Mongo? | O que faz |
|--------|:-:|-----------|
| `cleanup.sh`  | não | rename `questoesNovo`→`questoes`; `prova`→`provaBase` (mantém `numero`) → `*.out.json` |
| `validate.sh` | não | valida os `*.out.json` |
| `indices.sh`  | **sim** | dropa índices legados e cria os índices reversos finais |

## Pré-requisitos

`jq` (>=1.6), `bash`, o Mongo Database Tools (`mongodump`, `mongoexport`,
`mongoimport`) e `mongosh` (só para `indices.sh`). `$MONGODB` = URI do banco alvo.

## Procedimento (homol primeiro, depois prod)

Rodar **somente** após a 0001 ter sido aplicada (reimportada) e o deploy do
código anterior (Card 05) estar validado.

### 1. Backup obrigatório (restore safety)

```bash
mongodump --uri="$MONGODB" \
  --collection=provas \
  --collection=simulados \
  --collection=questoes \
  --out=./backup-0002
du -sh ./backup-0002            # confirmar tamanho não-zero
# subir ./backup-0002 para R2/S3 com retenção >=90 dias; anotar o caminho no PR
```

### 2. Exportar as collections (JSON array, Extended JSON relaxado = default)

```bash
mongoexport --uri="$MONGODB" --collection=provas    --jsonArray --out=provas.json
mongoexport --uri="$MONGODB" --collection=simulados --jsonArray --out=simulados.json
mongoexport --uri="$MONGODB" --collection=questoes  --jsonArray --out=questoes.json
```

### 3. Rodar o cleanup

```bash
bash cleanup.sh .            # gera provas.out.json, simulados.out.json, questoes.out.json
bash validate.sh .           # deve terminar com "✅ validate 0002 OK" (exit 0)
```

O pré-check do `cleanup.sh` **aborta** se achar prova/simulado com `questoesNovo`
vazio mas `questoes` antigo populado (sinal de que a 0001 não rodou, ou de que o
dump já foi migrado). Se sair com código 1, NÃO reimportar — investigar os logs.

### 4. Reimportar (drop + import — backup já salvo)

```bash
mongosh "$MONGODB" --eval 'db.provas.drop(); db.simulados.drop(); db.questoes.drop();'
mongoimport --uri="$MONGODB" --collection=provas    --jsonArray --file=provas.out.json
mongoimport --uri="$MONGODB" --collection=simulados --jsonArray --file=simulados.out.json
mongoimport --uri="$MONGODB" --collection=questoes  --jsonArray --file=questoes.out.json
```

### 5. Índices (conecta ao banco) — logo após reimportar

```bash
MONGODB='...' bash indices.sh    # deve terminar com "indices 0002 OK"
```

### 6. Deploy do código do Card 07a — imediatamente

O código do Card 07a lê `questoes` no shape novo `[{questao, numero}]`. Fazer o
deploy logo após reimportar + `indices.sh`, para não deixar o banco no shape novo
com código antigo em execução.

### 7. Produção

Repetir 1→6 em janela de manutenção, sem deploys/writes concorrentes. Backup
obrigatório antes. Se algo falhar → `rollback.md`.

## Idempotência

`cleanup.sh` reescreve os `*.out.json` sem tocar nos `.json` de entrada — rodar
2x sobre o mesmo dump dá o mesmo resultado. `indices.sh` também é idempotente
(`dropIndex` ignora índice inexistente; `createIndex` é no-op se já existe).
