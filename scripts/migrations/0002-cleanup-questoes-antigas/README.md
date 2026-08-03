# Migração 0002 — Cleanup Questões Antigas (Etapa 9, final)

Cleanup final da Etapa 9. Derruba o array antigo de refs (`questoes`), renomeia
o subdoc `questoesNovo` → `questoes` em `Prova`/`Simulado`, e remove os campos
legado `prova`/`numero` de `Questao`. Também dropa os índices legados
(`prova_1`, `numero_1`) e cria os índices reversos finais
(`questoes.questao`) em `provas` e `simulados`.

Diferente da 0001, esta migração **conecta ao Mongo** e opera in-place
(`$unset`/`$rename`/`updateMany`).

> **IRREVERSÍVEL sem restaurar backup.** O `$rename`/`$unset` remove os dados
> antigos; não há como reverter por script. Rodar **somente** após smoke e
> monitoramento do deploy anterior (Card 05) estarem OK. Ver `rollback.md`.

## Pré-requisitos

`mongosh`, `bash`, e o Mongo Database Tools (`mongodump`/`mongorestore`).
`$MONGODB` = URI do banco alvo.

## Procedimento (homol primeiro, depois prod)

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

Backup destas 3 collections. É a **única** via de rollback (ver `rollback.md`).

### 2. Rodar o cleanup

```bash
MONGODB='...' bash cleanup.sh
```

Deve terminar imprimindo `cleanup 0002 OK`. O pré-check aborta se houver prova
com `questoesNovo` vazio mas `questoes` antigo populado (sinal de que a 0001 não
rodou) — nesse caso, rodar a migração 0001 antes.

### 3. Validar

```bash
MONGODB='...' bash validate.sh
```

Deve imprimir `validate 0002 OK` (exit 0). Se sair com código 1, NÃO seguir para
o deploy — investigar os logs (e, se preciso, restaurar do backup do passo 1).

### 4. Deploy do código do Card 07a — imediatamente

O código do Card 07a lê `questoes` no shape novo `[{questao, numero}]` que o
script acabou de criar. Fazer o deploy logo após o `validate.sh` passar, para
não deixar o banco no shape novo com código antigo em execução.

### 5. Produção

Repetir 1→4 em janela de manutenção, sem deploys/writes concorrentes. Backup
obrigatório antes. Se algo falhar → `rollback.md`.

## Recuperação em caso de falha no meio

- Este script deve rodar **uma única vez**, numa janela de manutenção **sem
  escritas concorrentes**.
- Se ele **falhar no meio** (as operações são 5 `updateMany` separados,
  **não-transacionais**), **NÃO re-execute**. Restaure o backup (ver
  `rollback.md`) e recomece do zero — um estado parcial pode fazer o pré-check
  abortar, ou uma re-execução dropar dados já renomeados.
- O pré-check **aborta** se detectar estado inconsistente (inclusive um banco
  **já migrado**). Isso é **proteção**, não um erro a "forçar": se ele abortar,
  investigue o estado do banco, não contorne o script.

## Nota

`$unset` roda **antes** do `$rename` para evitar colisão de campo (o destino
`questoes` precisa não existir antes de renomear `questoesNovo` sobre ele).
Rodar em homologação antes de produção.
